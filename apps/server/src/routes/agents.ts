import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  agentCanCreateTask,
  can,
  isTextMime,
  isValidValue,
  toHandle,
  type ConfigOption,
} from "@oneswarm/shared";
import { badRequest, forbidden, HttpError, notFound, type AppContext } from "../context";
import { agents, bridgeDevices, channelMembers, channels, files, pairingCodes } from "../db/schema";
import { env } from "../env";
import { parse, requireActor } from "../http";
import {
  newId,
  normalizePairingCode,
  pairingCode,
  randomToken,
  sha256,
  verifyToken,
} from "../security";
import { agentDTOs, deviceDTO } from "../services/dto";
import { createTask } from "../services/tasks";

export function agentRoutes(app: FastifyInstance, ctx: AppContext): void {
  /* ------------------------------ agents ------------------------------ */

  app.patch("/api/agents/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "agent.manage")) throw forbidden();
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        handle: z.string().trim().min(1).max(32).optional(),
        canCreateTasks: z.boolean().optional(),
        channelIds: z.array(z.string()).max(500).optional(),
      }),
      req.body,
    );
    const [agent] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, actor.workspaceId), eq(agents.id, id)));
    if (!agent) throw notFound("Agent not found.");
    const changes: Partial<typeof agents.$inferInsert> = {};
    if (input.name) changes.name = input.name;
    if (input.canCreateTasks !== undefined) changes.canCreateTasks = input.canCreateTasks;
    if (input.handle) {
      const handle = toHandle(input.handle);
      const [clash] = await ctx.db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.workspaceId, actor.workspaceId), eq(agents.handle, handle)));
      if (clash && clash.id !== id)
        throw new HttpError(409, `@${handle} is already taken.`, "exists");
      changes.handle = handle;
    }
    if (Object.keys(changes).length)
      await ctx.db.update(agents).set(changes).where(eq(agents.id, id));
    if (input.channelIds) {
      await ctx.db
        .delete(channelMembers)
        .where(
          and(
            eq(channelMembers.workspaceId, actor.workspaceId),
            eq(channelMembers.memberType, "agent"),
            eq(channelMembers.memberId, id),
          ),
        );
      const valid = input.channelIds.length
        ? await ctx.db
            .select({ id: channels.id })
            .from(channels)
            .where(
              and(
                eq(channels.workspaceId, actor.workspaceId),
                inArray(channels.id, input.channelIds),
              ),
            )
        : [];
      if (valid.length) {
        await ctx.db.insert(channelMembers).values(
          valid.map((c) => ({
            channelId: c.id,
            workspaceId: actor.workspaceId,
            memberType: "agent" as const,
            memberId: id,
          })),
        );
      }
    }
    const [dto] = await agentDTOs(ctx.db, actor.workspaceId, ctx.bridges.statusOf, [id]);
    ctx.hub.broadcast(actor.workspaceId, { t: "agent.updated", agent: dto! });
    return { agent: dto };
  });

  /** Change a config option (model, effort, mode…) through `session/set_config_option`. */
  app.post("/api/agents/:id/config", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "agent.configure")) throw forbidden();
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({
        configId: z.string().min(1).max(100),
        value: z.union([z.string().max(200), z.boolean()]),
      }),
      req.body,
    );
    const [agent] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, actor.workspaceId), eq(agents.id, id)));
    if (!agent) throw notFound("Agent not found.");
    const option = (agent.configOptions ?? []).find((o: ConfigOption) => o.id === input.configId);
    if (!option) throw badRequest("This agent doesn't have that setting.");
    if (!isValidValue(option, input.value))
      throw badRequest("That value isn't one of the agent's options.");
    if (!ctx.bridges.setConfig(agent, input.configId, input.value)) {
      throw new HttpError(
        409,
        `${agent.name} is offline, so its settings can't change right now.`,
        "offline",
      );
    }
    // The chip updates when the agent confirms with config_option_update.
    return { ok: true };
  });

  app.delete("/api/agents/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "agent.manage")) throw forbidden();
    const { id } = req.params as { id: string };
    await ctx.db
      .delete(agents)
      .where(and(eq(agents.workspaceId, actor.workspaceId), eq(agents.id, id)));
    ctx.hub.broadcast(actor.workspaceId, { t: "agent.removed", agentId: id });
    return { ok: true };
  });

  /* ------------------------- pairing & devices ------------------------ */

  app.post("/api/bridge/pairing-codes", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "device.pair")) throw forbidden("Guests can't connect bridges.");
    const code = pairingCode();
    await ctx.db.insert(pairingCodes).values({
      id: newId(),
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const server =
      env.publicServerUrl === env.defaultBridgeServer ? "" : ` --server ${env.publicServerUrl}`;
    return {
      code,
      command: `npx oneswarm-bridge connect ${code}${server}`,
      expiresInSeconds: 15 * 60,
    };
  });

  /** Called by the bridge CLI. Trades a one-time code for a long-lived, revocable device token. */
  app.post(
    "/api/bridge/exchange",
    { config: { rateLimit: { max: env.authRateLimitPerMin, timeWindow: "1 minute" } } },
    async (req) => {
      const input = parse(
        z.object({
          code: z.string().min(4).max(20),
          name: z.string().trim().min(1).max(80),
          platform: z.string().max(40).default(""),
        }),
        req.body,
      );
      const codeHash = sha256(normalizePairingCode(input.code));
      const [pairing] = await ctx.db
        .select()
        .from(pairingCodes)
        .where(
          and(
            eq(pairingCodes.codeHash, codeHash),
            isNull(pairingCodes.usedAt),
            gt(pairingCodes.expiresAt, new Date()),
          ),
        );
      if (!pairing)
        throw new HttpError(
          400,
          "That code is wrong or has expired. Get a new one from the Connect screen.",
          "bad_code",
        );
      const token = randomToken("osb_", 32);
      const deviceId = newId();
      const [device] = await ctx.db
        .insert(bridgeDevices)
        .values({
          id: deviceId,
          workspaceId: pairing.workspaceId,
          userId: pairing.userId,
          name: input.name,
          platform: input.platform,
          tokenHash: sha256(token),
        })
        .returning();
      await ctx.db
        .update(pairingCodes)
        .set({ usedAt: new Date(), deviceId })
        .where(eq(pairingCodes.id, pairing.id));
      ctx.hub.broadcast(
        pairing.workspaceId,
        { t: "device.updated", device: deviceDTO(device!, false) },
        { staffOnly: true },
      );
      const wsUrl = env.publicServerUrl.replace(/^http/, "ws") + "/bridge";
      return { deviceToken: token, deviceId, workspaceId: pairing.workspaceId, wsUrl };
    },
  );

  app.get("/api/devices", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "device.manage")) throw forbidden();
    const rows = await ctx.db
      .select()
      .from(bridgeDevices)
      .where(eq(bridgeDevices.workspaceId, actor.workspaceId))
      .orderBy(desc(bridgeDevices.createdAt));
    return { devices: rows.map((d) => deviceDTO(d, ctx.bridges.isDeviceConnected(d.id))) };
  });

  app.patch("/api/devices/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "device.manage")) throw forbidden();
    const { id } = req.params as { id: string };
    const input = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    const [device] = await ctx.db
      .update(bridgeDevices)
      .set({ name: input.name })
      .where(and(eq(bridgeDevices.workspaceId, actor.workspaceId), eq(bridgeDevices.id, id)))
      .returning();
    if (!device) throw notFound("Device not found.");
    const dto = deviceDTO(device, ctx.bridges.isDeviceConnected(id));
    ctx.hub.broadcast(actor.workspaceId, { t: "device.updated", device: dto }, { staffOnly: true });
    for (const a of await agentDTOs(ctx.db, actor.workspaceId, ctx.bridges.statusOf)) {
      if (a.deviceId === id) ctx.hub.broadcast(actor.workspaceId, { t: "agent.updated", agent: a });
    }
    return { device: dto };
  });

  app.post("/api/devices/:id/revoke", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "device.manage")) throw forbidden();
    const { id } = req.params as { id: string };
    const [device] = await ctx.db
      .update(bridgeDevices)
      .set({ revokedAt: new Date() })
      .where(and(eq(bridgeDevices.workspaceId, actor.workspaceId), eq(bridgeDevices.id, id)))
      .returning();
    if (!device) throw notFound("Device not found.");
    ctx.bridges.revoke(id);
    const deviceAgents = await ctx.db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.deviceId, id));
    for (const a of deviceAgents)
      ctx.hub.broadcast(actor.workspaceId, { t: "agent.removed", agentId: a.id });
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "device.updated", device: deviceDTO(device, false) },
      { staffOnly: true },
    );
    return { ok: true };
  });

  /* ------------------- agent API (used by the bridge MCP) ------------------- */

  async function agentFromToken(req: FastifyRequest) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const data = verifyToken<{ k: string; ws: string; agent: string; ch: string }>(token);
    if (!data || data.k !== "agent")
      throw new HttpError(401, "Invalid or expired agent token.", "unauthorized");
    const [agent] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, data.ws), eq(agents.id, data.agent)));
    if (!agent) throw new HttpError(401, "Agent not found.", "unauthorized");
    const memberships = await ctx.db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.workspaceId, data.ws),
          eq(channelMembers.memberType, "agent"),
          eq(channelMembers.memberId, agent.id),
        ),
      );
    const channelIds = memberships.map((m) => m.channelId);
    // The token is scoped to one channel, and the agent must still belong to it.
    if (!channelIds.includes(data.ch)) throw forbidden("This agent is no longer in that channel.");
    return { agent, channelId: data.ch, workspaceId: data.ws, channelIds };
  }

  app.get("/api/agent-api/files", async (req) => {
    const scope = await agentFromToken(req);
    const rows = await ctx.db
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(eq(files.workspaceId, scope.workspaceId), eq(files.channelId, scope.channelId)))
      .orderBy(desc(files.createdAt))
      .limit(200);
    return { files: rows };
  });

  app.get("/api/agent-api/files/:id", async (req) => {
    const scope = await agentFromToken(req);
    const { id } = req.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.workspaceId, scope.workspaceId),
          eq(files.channelId, scope.channelId),
          or(eq(files.id, id), eq(files.name, id)),
        ),
      );
    if (!row) throw notFound("No file with that id or name in this channel.");
    if (!isTextMime(row.mime))
      return {
        file: { id: row.id, name: row.name, mime: row.mime, size: row.size },
        text: null,
        note: "Binary file; contents not shown.",
      };
    const buf = await ctx.storage.get(row.storageKey);
    const limit = 512 * 1024;
    return {
      file: { id: row.id, name: row.name, mime: row.mime, size: row.size },
      text: buf.subarray(0, limit).toString("utf8"),
      truncated: buf.length > limit,
    };
  });

  app.get("/api/agent-api/search", async (req) => {
    const scope = await agentFromToken(req);
    const { q } = parse(z.object({ q: z.string().min(1).max(200) }), req.query);
    const rows = await ctx.db
      .select()
      .from(files)
      .where(and(eq(files.workspaceId, scope.workspaceId), eq(files.channelId, scope.channelId)))
      .limit(200);
    const needle = q.toLowerCase();
    const results: Array<{ id: string; name: string; matches: string[] }> = [];
    for (const f of rows) {
      const matches: string[] = [];
      if (f.name.toLowerCase().includes(needle)) matches.push(`name: ${f.name}`);
      if (isTextMime(f.mime) && f.size <= 2 * 1024 * 1024) {
        const text = (await ctx.storage.get(f.storageKey)).toString("utf8");
        text.split("\n").forEach((line, i) => {
          if (matches.length < 20 && line.toLowerCase().includes(needle))
            matches.push(`${i + 1}: ${line.slice(0, 300)}`);
        });
      }
      if (matches.length) results.push({ id: f.id, name: f.name, matches });
    }
    return { results };
  });

  app.post("/api/agent-api/tasks", async (req) => {
    const scope = await agentFromToken(req);
    if (
      !agentCanCreateTask(
        { channelIds: scope.channelIds, canCreateTasks: scope.agent.canCreateTasks },
        scope.channelId,
      )
    ) {
      throw forbidden(
        `${scope.agent.name} isn't allowed to create tasks. A member can turn this on in Settings → Agents.`,
      );
    }
    const input = parse(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(20_000).optional(),
      }),
      req.body,
    );
    const task = await createTask(
      ctx,
      scope.workspaceId,
      { type: "agent", id: scope.agent.id },
      {
        title: input.title,
        description: input.description,
        channelId: scope.channelId,
      },
    );
    return { task };
  });
}
