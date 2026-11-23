import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { BridgeHub } from "../src/bridge-hub";
import { openDb, type DbHandle } from "../src/db/client";
import { RealtimeHub } from "../src/realtime";
import { createStorage } from "../src/storage";

let app: FastifyInstance;
let handle: DbHandle;

interface Client {
  cookie: string;
  csrf: string;
}

function cookies(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return Object.fromEntries(list.map((c) => c.split(";")[0]!.split("=") as [string, string]));
}

async function signup(email: string, workspace?: string): Promise<Client> {
  const first = await app.inject({ method: "GET", url: "/api/csrf" });
  const csrf0 = cookies(first).os_csrf!;
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    headers: { cookie: `os_csrf=${csrf0}`, "x-csrf-token": csrf0 },
    payload: { name: email.split("@")[0], email, password: "password123" },
  });
  expect(res.statusCode).toBe(200);
  const c = cookies(res);
  const client = { cookie: `os_session=${c.os_session}; os_csrf=${c.os_csrf}`, csrf: c.os_csrf! };
  if (workspace) {
    const ws = await call(client, "POST", "/api/workspaces", { name: workspace });
    expect(ws.statusCode).toBe(200);
  }
  return client;
}

function call(c: Client, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: c.cookie, "x-csrf-token": c.csrf },
    ...(payload ? { payload: payload as object } : {}),
  });
}

beforeAll(async () => {
  handle = await openDb("pglite://memory");
  await handle.migrate();
  app = await buildApp({
    db: handle.db,
    hub: new RealtimeHub(),
    bridges: new BridgeHub(),
    storage: createStorage(),
  });
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe("server API", () => {
  it("rejects cookie mutations without the CSRF header", async () => {
    const a = await signup("csrf@x.test", "CSRF Co");
    const res = await app.inject({
      method: "POST",
      url: "/api/channels",
      headers: { cookie: a.cookie },
      payload: { name: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("keeps workspaces isolated from each other", async () => {
    const a = await signup("alice@x.test", "Alpha");
    const b = await signup("bob@x.test", "Beta");
    const bootA = (await call(a, "GET", "/api/bootstrap")).json() as {
      channels: Array<{ id: string }>;
    };
    const channelA = bootA.channels[0]!.id;
    await call(a, "POST", `/api/channels/${channelA}/messages`, { body: "secret plans" });

    expect((await call(b, "GET", `/api/channels/${channelA}/messages`)).statusCode).toBe(404);
    expect(
      (await call(b, "POST", `/api/channels/${channelA}/messages`, { body: "hi" })).statusCode,
    ).toBe(404);
    const task = (await call(a, "POST", "/api/tasks", { title: "Alpha task" })).json() as {
      task: { id: string };
    };
    expect((await call(b, "GET", `/api/tasks/${task.task.id}`)).statusCode).toBe(404);
    expect(
      (await call(b, "PATCH", `/api/tasks/${task.task.id}`, { status: "done" })).statusCode,
    ).toBe(404);
    const bootB = (await call(b, "GET", "/api/bootstrap")).json() as {
      tasks: unknown[];
      channels: unknown[];
    };
    expect(bootB.tasks).toHaveLength(0);
    expect(bootB.channels).toHaveLength(1);
  });

  it("allows one workspace per account and invites by link", async () => {
    const owner = await signup("owner@x.test", "Gamma");
    expect((await call(owner, "POST", "/api/workspaces", { name: "Second" })).statusCode).toBe(409);
    const invite = (
      await call(owner, "POST", "/api/invites", { email: "guest@x.test", role: "guest" })
    ).json() as { token: string };
    const guest = await signup("guest@x.test");
    expect((await call(guest, "POST", `/api/invites/${invite.token}/accept`)).statusCode).toBe(200);
    const boot = (await call(guest, "GET", "/api/bootstrap")).json() as {
      role: string;
      channels: unknown[];
    };
    expect(boot.role).toBe("guest");
    expect(boot.channels).toHaveLength(0);
    expect((await call(guest, "POST", "/api/channels", { name: "nope" })).statusCode).toBe(403);
  });

  it("pairs a bridge once and stores only a hash of the device token", async () => {
    const a = await signup("pair@x.test", "Delta");
    const { code } = (await call(a, "POST", "/api/bridge/pairing-codes")).json() as {
      code: string;
    };
    const ok = await app.inject({
      method: "POST",
      url: "/api/bridge/exchange",
      payload: { code: code.toLowerCase().replace("-", ""), name: "laptop" },
    });
    expect(ok.statusCode).toBe(200);
    const token = (ok.json() as { deviceToken: string }).deviceToken;
    expect(token.startsWith("osb_")).toBe(true);
    const again = await app.inject({
      method: "POST",
      url: "/api/bridge/exchange",
      payload: { code, name: "laptop" },
    });
    expect(again.statusCode).toBe(400);
    const rows = await handle.db.query.bridgeDevices.findMany();
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
  });
});
