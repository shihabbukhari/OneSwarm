import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { WebSocketServer } from "ws";
import { and, eq, isNull } from "drizzle-orm";
import type { IncomingMessage } from "node:http";
import type { AppContext } from "./context";
import { bridgeDevices } from "./db/schema";
import { env } from "./env";
import { csrfHook, errorHandler } from "./http";
import { sha256 } from "./security";
import { agentRoutes } from "./routes/agents";
import { authRoutes } from "./routes/auth";
import { channelRoutes } from "./routes/channels";
import { fileRoutes } from "./routes/files";
import { taskRoutes } from "./routes/tasks";
import { workspaceRoutes } from "./routes/workspace";
import { onTaskRunEnd } from "./services/tasks";

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isProd ? { level: "info" } : { level: "warn" },
    trustProxy: env.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  // Accept empty JSON bodies (e.g. POST without a payload).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = String(body ?? "").trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error("Invalid JSON body") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: env.limits.maxFileSizeBytes, files: 1, fields: 10 },
  });
  app.addHook("onRequest", csrfHook);
  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "same-origin");
  });
  app.setErrorHandler(errorHandler);

  app.get("/api/health", async () => ({ ok: true }));
  authRoutes(app, ctx);
  workspaceRoutes(app, ctx);
  channelRoutes(app, ctx);
  fileRoutes(app, ctx);
  taskRoutes(app, ctx);
  agentRoutes(app, ctx);

  ctx.bridges.bind(ctx);
  ctx.bridges.onRunEnd((run, outcome) => onTaskRunEnd(ctx, run, outcome));

  // Two WebSocket endpoints: /ws for browsers (single-use ticket) and /bridge for devices (bearer token).
  const browserWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const bridgeWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

  app.server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/ws") {
      const ticket = ctx.hub.redeemTicket(url.searchParams.get("ticket") ?? "");
      if (!ticket) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      browserWss.handleUpgrade(req, socket, head, (ws) => ctx.hub.attach(ws, ticket));
      return;
    }
    if (url.pathname === "/bridge") {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      void (async () => {
        const [device] = token
          ? await ctx.db
              .select()
              .from(bridgeDevices)
              .where(
                and(eq(bridgeDevices.tokenHash, sha256(token)), isNull(bridgeDevices.revokedAt)),
              )
          : [];
        if (!device) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        bridgeWss.handleUpgrade(req, socket, head, (ws) => ctx.bridges.attach(ws, device));
      })().catch(() => socket.destroy());
      return;
    }
    socket.destroy();
  });

  app.addHook("onClose", async () => {
    ctx.bridges.close();
    browserWss.close();
    bridgeWss.close();
  });
  return app;
}
