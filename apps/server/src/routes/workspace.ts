import type { FastifyInstance } from "fastify";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  can,
  canChangeRole,
  invitableRoles,
  type BootstrapDTO,
  type MemberDTO,
  type Role,
} from "@oneswarm/shared";
import { badRequest, forbidden, HttpError, notFound, type AppContext } from "../context";
import {
  approvals,
  bridgeDevices,
  channelMembers,
  channels,
  invites,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { env } from "../env";
import { parse, requireActor, requireUser } from "../http";
import { newId, randomToken, sha256 } from "../security";
import {
  agentDTOs,
  agentMessagesLastHour,
  approvalDTO,
  channelDTOs,
  deviceDTO,
  storageUsed,
  taskDTO,
} from "../services/dto";

const roleSchema = z.enum(["owner", "member", "guest"]);

async function membersOf(ctx: AppContext, workspaceId: string): Promise<MemberDTO[]> {
  const rows = await ctx.db
    .select({ userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

async function joinWorkspace(ctx: AppContext, workspaceId: string, userId: string, role: Role) {
  await ctx.db.insert(workspaceMembers).values({ workspaceId, userId, role });
  // Owners and members join #general; guests are added to channels one by one.
  if (role !== "guest") {
    const [general] = await ctx.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.workspaceId, workspaceId), eq(channels.name, "general")));
    if (general) {
      await ctx.db
        .insert(channelMembers)
        .values({ channelId: general.id, workspaceId, memberType: "human", memberId: userId })
        .onConflictDoNothing();
    }
  }
}

export function workspaceRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/workspaces", async (req) => {
    const user = await requireUser(ctx, req);
    const input = parse(
      z.object({ name: z.string().trim().min(1, "Name your workspace.").max(60) }),
      req.body,
    );
    const [existing] = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    if (existing) throw new HttpError(409, "You already belong to a workspace.", "has_workspace");
    const workspaceId = newId();
    await ctx.db.insert(workspaces).values({ id: workspaceId, name: input.name, ownerId: user.id });
    await ctx.db.insert(channels).values({
      id: newId(),
      workspaceId,
      name: "general",
      topic: "Everyone, people and agents.",
      createdBy: user.id,
    });
    await joinWorkspace(ctx, workspaceId, user.id, "owner");
    return { workspace: { id: workspaceId, name: input.name } };
  });

  app.patch("/api/workspace", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "workspace.update")) throw forbidden();
    const input = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    await ctx.db
      .update(workspaces)
      .set({ name: input.name })
      .where(eq(workspaces.id, actor.workspaceId));
    return { workspace: { id: actor.workspaceId, name: input.name } };
  });

  app.get("/api/bootstrap", async (req): Promise<BootstrapDTO> => {
    const actor = await requireActor(ctx, req);
    const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, actor.workspaceId));
    const channelList = await channelDTOs(ctx.db, actor.workspaceId, actor.userId, {
      onlyMember: actor.role === "guest",
    });
    const visibleChannels = channelList.map((c) => c.id);
    const taskRows = await ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, actor.workspaceId))
      .orderBy(asc(tasks.number));
    const approvalRows = await ctx.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, actor.workspaceId),
          eq(approvals.status, "pending"),
          inArray(approvals.channelId, visibleChannels.length ? visibleChannels : ["-"]),
        ),
      );
    const devices = can(actor.role, "device.manage")
      ? await ctx.db
          .select()
          .from(bridgeDevices)
          .where(
            and(eq(bridgeDevices.workspaceId, actor.workspaceId), isNull(bridgeDevices.revokedAt)),
          )
      : [];
    return {
      user: { id: actor.userId, email: actor.email, name: actor.name },
      workspace: { id: ws!.id, name: ws!.name },
      role: actor.role,
      members: await membersOf(ctx, actor.workspaceId),
      channels: channelList,
      agents: await agentDTOs(ctx.db, actor.workspaceId, ctx.bridges.statusOf),
      tasks: taskRows
        .filter(
          (t) => actor.role !== "guest" || !t.channelId || visibleChannels.includes(t.channelId),
        )
        .map(taskDTO),
      approvals: approvalRows.map(approvalDTO),
      devices: devices.map((d) => deviceDTO(d, ctx.bridges.isDeviceConnected(d.id))),
      limits: {
        maxFileSizeBytes: env.limits.maxFileSizeBytes,
        workspaceStorageBytes: env.limits.workspaceStorageBytes,
        agentMessagesPerHour: env.limits.agentMessagesPerHour,
        storageUsedBytes: await storageUsed(ctx.db, actor.workspaceId),
        agentMessagesThisHour: await agentMessagesLastHour(ctx.db, actor.workspaceId),
      },
      wsUrl: env.publicWsUrl,
      bridgeServerUrl: env.publicServerUrl === env.defaultBridgeServer ? "" : env.publicServerUrl,
    };
  });

  app.post("/api/realtime/ticket", async (req) => {
    const actor = await requireActor(ctx, req);
    const guestChannels =
      actor.role === "guest"
        ? (
            await ctx.db
              .select({ id: channelMembers.channelId })
              .from(channelMembers)
              .where(
                and(
                  eq(channelMembers.workspaceId, actor.workspaceId),
                  eq(channelMembers.memberType, "human"),
                  eq(channelMembers.memberId, actor.userId),
                ),
              )
          ).map((r) => r.id)
        : [];
    const ticket = ctx.hub.issueTicket({
      userId: actor.userId,
      name: actor.name,
      workspaceId: actor.workspaceId,
      role: actor.role,
      guestChannels,
    });
    return { ticket, wsUrl: env.publicWsUrl };
  });

  /* ----------------------------- members ----------------------------- */

  app.get("/api/members", async (req) => {
    const actor = await requireActor(ctx, req);
    return { members: await membersOf(ctx, actor.workspaceId) };
  });

  app.patch("/api/members/:userId", async (req) => {
    const actor = await requireActor(ctx, req);
    const { userId } = req.params as { userId: string };
    const input = parse(z.object({ role: roleSchema }), req.body);
    const [target] = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
    if (!target) throw notFound("Member not found.");
    const [owners] = await ctx.db
      .select({ n: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.role, "owner"),
        ),
      );
    if (
      !canChangeRole({
        actorRole: actor.role,
        targetRole: target.role as Role,
        nextRole: input.role,
        ownerCount: Number(owners?.n ?? 0),
      })
    ) {
      throw forbidden("Only owners can change roles, and a workspace keeps at least one owner.");
    }
    await ctx.db
      .update(workspaceMembers)
      .set({ role: input.role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
    const member = (await membersOf(ctx, actor.workspaceId)).find((m) => m.userId === userId)!;
    ctx.hub.broadcast(actor.workspaceId, { t: "member.updated", member });
    ctx.hub.disconnectUser(actor.workspaceId, userId); // reconnect with the new role
    return { member };
  });

  app.delete("/api/members/:userId", async (req) => {
    const actor = await requireActor(ctx, req);
    const { userId } = req.params as { userId: string };
    if (!can(actor.role, "member.manage")) throw forbidden();
    if (userId === actor.userId) throw badRequest("You can't remove yourself.");
    await ctx.db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
    await ctx.db
      .delete(channelMembers)
      .where(
        and(
          eq(channelMembers.workspaceId, actor.workspaceId),
          eq(channelMembers.memberType, "human"),
          eq(channelMembers.memberId, userId),
        ),
      );
    ctx.hub.broadcast(actor.workspaceId, { t: "member.removed", userId });
    ctx.hub.disconnectUser(actor.workspaceId, userId);
    return { ok: true };
  });

  /* ----------------------------- invites ----------------------------- */

  app.post("/api/invites", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "member.invite")) throw forbidden();
    const input = parse(
      z.object({
        email: z.string().trim().toLowerCase().email("Enter a valid email."),
        role: roleSchema,
      }),
      req.body,
    );
    if (!invitableRoles(actor.role).includes(input.role))
      throw forbidden("You can't invite someone with that role.");
    const token = randomToken("inv_", 24);
    await ctx.db.insert(invites).values({
      id: newId(),
      workspaceId: actor.workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: actor.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    // No email provider is configured in v1: the inviter copies the link.
    return { url: `${env.publicAppUrl}/invite/${token}`, token };
  });

  app.get("/api/invites/:token", async (req) => {
    const { token } = req.params as { token: string };
    const [invite] = await ctx.db
      .select({ invite: invites, workspaceName: workspaces.name, inviter: users.name })
      .from(invites)
      .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
      .innerJoin(users, eq(users.id, invites.invitedBy))
      .where(eq(invites.tokenHash, sha256(token)));
    if (!invite || invite.invite.acceptedAt || invite.invite.expiresAt < new Date()) {
      throw notFound("This invite link has expired or was already used.");
    }
    return {
      workspaceName: invite.workspaceName,
      inviter: invite.inviter,
      email: invite.invite.email,
      role: invite.invite.role,
    };
  });

  app.post("/api/invites/:token/accept", async (req) => {
    const user = await requireUser(ctx, req);
    const { token } = req.params as { token: string };
    const [invite] = await ctx.db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, sha256(token)));
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
      throw notFound("This invite link has expired or was already used.");
    const [existing] = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    if (existing) {
      if (existing.workspaceId === invite.workspaceId) return { ok: true };
      throw new HttpError(
        409,
        "Your account already belongs to another workspace. Sign up with a different email to join this one.",
        "has_workspace",
      );
    }
    await ctx.db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    await joinWorkspace(ctx, invite.workspaceId, user.id, invite.role as Role);
    const member = (await membersOf(ctx, invite.workspaceId)).find((m) => m.userId === user.id);
    if (member) ctx.hub.broadcast(invite.workspaceId, { t: "member.updated", member });
    return { ok: true };
  });

  app.get("/api/limits", async (req) => {
    const actor = await requireActor(ctx, req);
    return {
      maxFileSizeBytes: env.limits.maxFileSizeBytes,
      workspaceStorageBytes: env.limits.workspaceStorageBytes,
      agentMessagesPerHour: env.limits.agentMessagesPerHour,
      storageUsedBytes: await storageUsed(ctx.db, actor.workspaceId),
      agentMessagesThisHour: await agentMessagesLastHour(ctx.db, actor.workspaceId),
    };
  });
}
