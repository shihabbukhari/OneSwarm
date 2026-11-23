import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { can, normalizeChannelName } from "@oneswarm/shared";
import { badRequest, forbidden, HttpError, notFound, type AppContext } from "../context";
import { agents, channelMembers, channels, messages, workspaceMembers } from "../db/schema";
import { parse, requireActor } from "../http";
import { newId } from "../security";
import {
  agentDTOs,
  channelDTO,
  listChannelMessages,
  listThread,
  loadMessage,
} from "../services/dto";
import { channelForActor, ensureHumanMember, postHumanMessage } from "../services/messages";

export function channelRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/channels", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "channel.create")) throw forbidden("Guests can't create channels.");
    const input = parse(
      z.object({ name: z.string().min(1).max(60), topic: z.string().max(250).optional() }),
      req.body,
    );
    const name = normalizeChannelName(input.name);
    if (!name) throw badRequest("Use letters, numbers or dashes for the channel name.");
    const [exists] = await ctx.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.workspaceId, actor.workspaceId), eq(channels.name, name)));
    if (exists) throw new HttpError(409, `#${name} already exists.`, "exists");
    const id = newId();
    await ctx.db.insert(channels).values({
      id,
      workspaceId: actor.workspaceId,
      name,
      topic: input.topic ?? "",
      createdBy: actor.userId,
    });
    await ensureHumanMember(ctx, actor.workspaceId, id, actor.userId);
    const dto = await channelDTO(ctx.db, actor.workspaceId, actor.userId, id);
    // Other people get the channel without their own membership flag.
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "channel.created", channel: { ...dto!, isMember: false, unread: 0 } },
      { staffOnly: true, exceptUserId: actor.userId },
    );
    return { channel: dto };
  });

  app.patch("/api/channels/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "channel.update")) throw forbidden();
    const { id } = req.params as { id: string };
    await channelForActor(ctx, actor, id);
    const input = parse(
      z.object({
        name: z.string().min(1).max(60).optional(),
        topic: z.string().max(250).optional(),
      }),
      req.body,
    );
    const changes: Partial<typeof channels.$inferInsert> = {};
    if (input.topic !== undefined) changes.topic = input.topic;
    if (input.name !== undefined) {
      const name = normalizeChannelName(input.name);
      if (!name) throw badRequest("Use letters, numbers or dashes for the channel name.");
      changes.name = name;
    }
    await ctx.db
      .update(channels)
      .set(changes)
      .where(and(eq(channels.workspaceId, actor.workspaceId), eq(channels.id, id)));
    const dto = await channelDTO(ctx.db, actor.workspaceId, actor.userId, id);
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "channel.updated", channel: dto! },
      { channelId: id },
    );
    return { channel: dto };
  });

  app.post("/api/channels/:id/join", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    await channelForActor(ctx, actor, id);
    await ensureHumanMember(ctx, actor.workspaceId, id, actor.userId);
    return { channel: await channelDTO(ctx.db, actor.workspaceId, actor.userId, id) };
  });

  app.post("/api/channels/:id/read", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    await channelForActor(ctx, actor, id);
    await ctx.db
      .update(channelMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(channelMembers.channelId, id),
          eq(channelMembers.memberType, "human"),
          eq(channelMembers.memberId, actor.userId),
        ),
      );
    return { ok: true };
  });

  app.get("/api/channels/:id/messages", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    await channelForActor(ctx, actor, id);
    const q = parse(
      z.object({
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const list = await listChannelMessages(ctx.db, ctx.storage, actor.workspaceId, id, {
      before: q.before ? new Date(q.before) : undefined,
      limit: q.limit,
    });
    return { messages: list, hasMore: list.length === q.limit };
  });

  app.get("/api/messages/:id/thread", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const root = await loadMessage(ctx.db, ctx.storage, actor.workspaceId, id);
    if (!root) throw notFound("Thread not found.");
    await channelForActor(ctx, actor, root.channelId);
    return {
      root,
      replies: await listThread(ctx.db, ctx.storage, actor.workspaceId, root.threadId ?? root.id),
    };
  });

  app.get("/api/messages/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const msg = await loadMessage(ctx.db, ctx.storage, actor.workspaceId, id);
    if (!msg) throw notFound("Message not found.");
    await channelForActor(ctx, actor, msg.channelId);
    return { message: msg };
  });

  app.post("/api/channels/:id/messages", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({
        body: z.string().max(20_000),
        clientId: z.string().max(64).optional(),
        threadId: z.string().max(64).nullable().optional(),
        attachmentIds: z.array(z.string().max(64)).max(10).optional(),
      }),
      req.body,
    );
    const message = await postHumanMessage(ctx, actor, { channelId: id, ...input });
    return { message };
  });

  app.patch("/api/messages/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const input = parse(z.object({ body: z.string().min(1).max(20_000) }), req.body);
    const [row] = await ctx.db
      .select()
      .from(messages)
      .where(and(eq(messages.workspaceId, actor.workspaceId), eq(messages.id, id)));
    if (!row) throw notFound("Message not found.");
    if (row.authorType !== "human" || row.authorId !== actor.userId)
      throw forbidden("You can only edit your own messages.");
    await ctx.db
      .update(messages)
      .set({ body: input.body, updatedAt: new Date() })
      .where(eq(messages.id, id));
    const dto = await loadMessage(ctx.db, ctx.storage, actor.workspaceId, id);
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "message.updated", message: dto! },
      { channelId: row.channelId },
    );
    return { message: dto };
  });

  /** Add or remove a person or an agent from a channel. */
  app.post("/api/channels/:id/members", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({ type: z.enum(["human", "agent"]), memberId: z.string(), add: z.boolean() }),
      req.body,
    );
    if (
      input.type === "agent" ? !can(actor.role, "agent.manage") : !can(actor.role, "channel.update")
    )
      throw forbidden();
    await channelForActor(ctx, actor, id);
    if (input.type === "agent") {
      const [agent] = await ctx.db
        .select()
        .from(agents)
        .where(and(eq(agents.workspaceId, actor.workspaceId), eq(agents.id, input.memberId)));
      if (!agent) throw notFound("Agent not found.");
    } else {
      const [member] = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, actor.workspaceId),
            eq(workspaceMembers.userId, input.memberId),
          ),
        );
      if (!member) throw notFound("Person not found.");
      ctx.hub.setGuestChannel(actor.workspaceId, input.memberId, id, input.add);
    }
    if (input.add) {
      await ctx.db
        .insert(channelMembers)
        .values({
          channelId: id,
          workspaceId: actor.workspaceId,
          memberType: input.type,
          memberId: input.memberId,
        })
        .onConflictDoNothing();
    } else {
      await ctx.db
        .delete(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, id),
            eq(channelMembers.memberType, input.type),
            eq(channelMembers.memberId, input.memberId),
          ),
        );
    }
    if (input.type === "agent") {
      const [dto] = await agentDTOs(ctx.db, actor.workspaceId, ctx.bridges.statusOf, [
        input.memberId,
      ]);
      if (dto) ctx.hub.broadcast(actor.workspaceId, { t: "agent.updated", agent: dto });
    }
    const channel = await channelDTO(ctx.db, actor.workspaceId, actor.userId, id);
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "channel.updated", channel: { ...channel!, unread: 0 } },
      { channelId: id, exceptUserId: actor.userId },
    );
    return { channel };
  });
}
