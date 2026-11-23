import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import { type z, ZodError } from "zod";
import type { Role } from "@oneswarm/shared";
import { HttpError, type Actor, type AppContext } from "./context";
import { sessions, users, workspaceMembers } from "./db/schema";
import { env } from "./env";
import { randomToken, safeEqual, sha256 } from "./security";

export const SESSION_COOKIE = "os_session";
export const CSRF_COOKIE = "os_csrf";
export const CSRF_HEADER = "x-csrf-token";
const SESSION_DAYS = 30;

export function cookieOpts(httpOnly: boolean, maxAgeSeconds?: number) {
  return {
    path: "/",
    httpOnly,
    sameSite: "lax" as const,
    secure: env.isProd,
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  };
}

export async function createSession(
  ctx: AppContext,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const token = randomToken("", 32);
  await ctx.db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000),
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOpts(true, SESSION_DAYS * 24 * 3600));
  // Rotate the CSRF token with the session.
  reply.setCookie(CSRF_COOKIE, randomToken("", 24), cookieOpts(false, SESSION_DAYS * 24 * 3600));
}

export async function destroySession(
  ctx: AppContext,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await ctx.db.delete(sessions).where(eq(sessions.id, sha256(token)));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getUser(ctx: AppContext, req: FastifyRequest): Promise<SessionUser | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const [row] = await ctx.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      expiresAt: sessions.expiresAt,
      sid: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  // Sliding expiry: extend sessions that are past half their life.
  if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * 24 * 3600 * 1000) {
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000) })
      .where(eq(sessions.id, row.sid));
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function requireUser(ctx: AppContext, req: FastifyRequest): Promise<SessionUser> {
  const user = await getUser(ctx, req);
  if (!user) throw new HttpError(401, "Please sign in.", "unauthorized");
  return user;
}

/** The signed-in person plus their workspace. Every workspace query is scoped by `workspaceId`. */
export async function requireActor(ctx: AppContext, req: FastifyRequest): Promise<Actor> {
  const user = await requireUser(ctx, req);
  const [membership] = await ctx.db
    .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id));
  if (!membership) throw new HttpError(409, "Create a workspace first.", "no_workspace");
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    workspaceId: membership.workspaceId,
    role: membership.role as Role,
  };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Endpoints called by the bridge CLI with a bearer token or pairing code, never by a browser session. */
const CSRF_EXEMPT = [/^\/api\/bridge\/exchange$/, /^\/api\/agent-api\//];

/** Double-submit CSRF check for cookie-authenticated mutations. */
export function csrfHook(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!req.cookies[CSRF_COOKIE]) {
    reply.setCookie(CSRF_COOKIE, randomToken("", 24), cookieOpts(false, SESSION_DAYS * 24 * 3600));
  }
  const path = req.url.split("?")[0] ?? "";
  if (
    !MUTATING.has(req.method) ||
    !path.startsWith("/api/") ||
    CSRF_EXEMPT.some((re) => re.test(path))
  ) {
    done();
    return;
  }
  const cookie = req.cookies[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || typeof header !== "string" || !safeEqual(cookie, header)) {
    void reply.code(403).send({
      error: "Your session form token is missing or stale. Reload the page and try again.",
      code: "csrf",
    });
    return;
  }
  done();
}

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

export function errorHandler(err: unknown, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof HttpError) {
    void reply.code(err.status).send({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    void reply.code(400).send({
      error: first ? `${field ? field + ": " : ""}${first.message}` : "Invalid input.",
      code: "invalid",
    });
    return;
  }
  const e = err as { statusCode?: number; message?: string; code?: string };
  if (e.statusCode === 429) {
    void reply
      .code(429)
      .send({ error: "Too many attempts. Wait a minute and try again.", code: "rate_limited" });
    return;
  }
  if (e.code === "FST_REQ_FILE_TOO_LARGE") {
    void reply.code(413).send({
      error: `Files can be up to ${Math.round(env.limits.maxFileSizeBytes / 1024 / 1024)} MB.`,
      code: "limit",
    });
    return;
  }
  if (e.statusCode && e.statusCode < 500) {
    void reply
      .code(e.statusCode)
      .send({ error: e.message ?? "Bad request", code: e.code ?? "error" });
    return;
  }
  req.log.error(err);
  void reply.code(500).send({ error: "Something went wrong on our side.", code: "server_error" });
}
