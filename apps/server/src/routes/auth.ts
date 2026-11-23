import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, type AppContext } from "../context";
import { users, workspaceMembers, workspaces } from "../db/schema";
import { env } from "../env";
import { createSession, destroySession, getUser, parse } from "../http";
import { dummyPasswordHash, hashPassword, newId, verifyPassword } from "../security";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1).max(200),
});

export function authRoutes(app: FastifyInstance, ctx: AppContext): void {
  const limited = {
    config: { rateLimit: { max: env.authRateLimitPerMin, timeWindow: "1 minute" } },
  };

  app.get("/api/csrf", async () => ({ ok: true }));

  app.post("/api/auth/signup", limited, async (req, reply) => {
    const input = parse(signupSchema, req.body);
    const [existing] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email));
    if (existing)
      throw new HttpError(
        409,
        "An account with that email already exists. Sign in instead.",
        "exists",
      );
    const id = newId();
    await ctx.db.insert(users).values({
      id,
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    });
    await createSession(ctx, reply, id);
    return { user: { id, email: input.email, name: input.name } };
  });

  app.post("/api/auth/login", limited, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email));
    const ok = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    if (!user || !ok)
      throw new HttpError(401, "That email and password don't match.", "bad_credentials");
    await createSession(ctx, reply, user.id);
    return { user: { id: user.id, email: user.email, name: user.name } };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(ctx, req, reply);
    return { ok: true };
  });

  app.get("/api/me", async (req) => {
    const user = await getUser(ctx, req);
    if (!user) throw new HttpError(401, "Please sign in.", "unauthorized");
    const [membership] = await ctx.db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        name: workspaces.name,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.id));
    return {
      user,
      workspace: membership ? { id: membership.workspaceId, name: membership.name } : null,
      role: membership?.role ?? null,
    };
  });

  app.patch("/api/me", async (req) => {
    const user = await getUser(ctx, req);
    if (!user) throw new HttpError(401, "Please sign in.", "unauthorized");
    const input = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    await ctx.db.update(users).set({ name: input.name }).where(eq(users.id, user.id));
    return { user: { ...user, name: input.name } };
  });
}
