import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type {
  AgentDTO,
  ApprovalDTO,
  ChannelDTO,
  DeviceDTO,
  FileDTO,
  MessageDTO,
  TaskDTO,
  TaskEventDTO,
} from "@oneswarm/shared";
import type { Db } from "../db/client";
import {
  agents,
  approvals,
  bridgeDevices,
  channelMembers,
  channels,
  files,
  messageAttachments,
  messages,
  taskEvents,
  type tasks,
  users,
} from "../db/schema";
import type { Storage } from "../storage";

type MessageRow = typeof messages.$inferSelect;
type FileRow = typeof files.$inferSelect;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function fileDTO(storage: Storage, f: FileRow): Promise<FileDTO> {
  return {
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: f.size,
    channelId: f.channelId,
    taskId: f.taskId,
    createdAt: f.createdAt.toISOString(),
    url: await storage.signedUrl({ key: f.storageKey, fileId: f.id, name: f.name, mime: f.mime }),
  };
}

/** Names for a mixed list of human and agent authors. */
export async function authorNames(
  db: Db,
  workspaceId: string,
  rows: Array<{ authorType: string; authorId: string | null }>,
): Promise<Map<string, string>> {
  const humanIds = [
    ...new Set(rows.filter((r) => r.authorType === "human" && r.authorId).map((r) => r.authorId!)),
  ];
  const agentIds = [
    ...new Set(rows.filter((r) => r.authorType === "agent" && r.authorId).map((r) => r.authorId!)),
  ];
  const names = new Map<string, string>();
  if (humanIds.length) {
    for (const u of await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, humanIds))) {
      names.set(`human:${u.id}`, u.name);
    }
  }
  if (agentIds.length) {
    for (const a of await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), inArray(agents.id, agentIds)))) {
      names.set(`agent:${a.id}`, a.name);
    }
  }
  return names;
}

export async function messageDTOs(
  db: Db,
  storage: Storage,
  workspaceId: string,
  rows: MessageRow[],
): Promise<MessageDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const names = await authorNames(db, workspaceId, rows);
  const replyStats = new Map<string, { n: number; last: Date | null }>();
  const roots = rows.filter((r) => !r.threadId).map((r) => r.id);
  if (roots.length) {
    const stats = await db
      .select({
        threadId: messages.threadId,
        n: count(),
        last: sql<Date | string>`max(${messages.createdAt})`,
      })
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), inArray(messages.threadId, roots)))
      .groupBy(messages.threadId);
    for (const s of stats)
      replyStats.set(s.threadId!, { n: Number(s.n), last: s.last ? new Date(s.last) : null });
  }
  const attachRows = await db
    .select({ messageId: messageAttachments.messageId, file: files })
    .from(messageAttachments)
    .innerJoin(files, eq(files.id, messageAttachments.fileId))
    .where(
      and(
        eq(messageAttachments.workspaceId, workspaceId),
        inArray(messageAttachments.messageId, ids),
      ),
    );
  const approvalIds = rows.map((r) => r.meta?.approvalId).filter((x): x is string => Boolean(x));
  const approvalMap = new Map<string, ApprovalDTO>();
  if (approvalIds.length) {
    const found = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.workspaceId, workspaceId), inArray(approvals.id, approvalIds)));
    for (const a of found) approvalMap.set(a.id, approvalDTO(a));
  }
  const attachments = new Map<string, FileDTO[]>();
  for (const a of attachRows) {
    const list = attachments.get(a.messageId) ?? [];
    list.push(await fileDTO(storage, a.file));
    attachments.set(a.messageId, list);
  }
  return rows.map((r) => {
    const stats = replyStats.get(r.id);
    return {
      id: r.id,
      clientId: r.clientId,
      channelId: r.channelId,
      threadId: r.threadId,
      authorType: r.authorType,
      authorId: r.authorId,
      authorName:
        r.authorType === "system"
          ? "OneSwarm"
          : (names.get(`${r.authorType}:${r.authorId}`) ?? "Someone"),
      body: r.body,
      kind: r.kind,
      status: r.status,
      meta: r.meta ?? {},
      attachments: attachments.get(r.id) ?? [],
      approval: r.meta?.approvalId ? (approvalMap.get(r.meta.approvalId) ?? null) : null,
      replyCount: stats?.n ?? 0,
      lastReplyAt: iso(stats?.last),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function loadMessage(
  db: Db,
  storage: Storage,
  workspaceId: string,
  id: string,
): Promise<MessageDTO | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.workspaceId, workspaceId), eq(messages.id, id)));
  if (!row) return null;
  const [dto] = await messageDTOs(db, storage, workspaceId, [row]);
  return dto ?? null;
}

export async function listChannelMessages(
  db: Db,
  storage: Storage,
  workspaceId: string,
  channelId: string,
  opts: { before?: Date; limit: number },
): Promise<MessageDTO[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.channelId, channelId),
        isNull(messages.threadId),
        opts.before ? lt(messages.createdAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(opts.limit);
  return messageDTOs(db, storage, workspaceId, rows.reverse());
}

export async function listThread(
  db: Db,
  storage: Storage,
  workspaceId: string,
  rootId: string,
): Promise<MessageDTO[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.workspaceId, workspaceId), eq(messages.threadId, rootId)))
    .orderBy(asc(messages.createdAt))
    .limit(500);
  return messageDTOs(db, storage, workspaceId, rows);
}

export async function channelDTOs(
  db: Db,
  workspaceId: string,
  userId: string,
  opts: { onlyMember: boolean; channelIds?: string[] },
): Promise<ChannelDTO[]> {
  const rows = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.workspaceId, workspaceId),
        opts.channelIds
          ? inArray(channels.id, opts.channelIds.length ? opts.channelIds : ["-"])
          : undefined,
      ),
    )
    .orderBy(asc(channels.name));
  const memberCounts = await db
    .select({ channelId: channelMembers.channelId, n: count() })
    .from(channelMembers)
    .where(eq(channelMembers.workspaceId, workspaceId))
    .groupBy(channelMembers.channelId);
  const mine = await db
    .select({ channelId: channelMembers.channelId, lastReadAt: channelMembers.lastReadAt })
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.workspaceId, workspaceId),
        eq(channelMembers.memberType, "human"),
        eq(channelMembers.memberId, userId),
      ),
    );
  const mineMap = new Map(mine.map((m) => [m.channelId, m.lastReadAt]));
  const out: ChannelDTO[] = [];
  for (const c of rows) {
    const isMember = mineMap.has(c.id);
    if (opts.onlyMember && !isMember) continue;
    let unread = 0;
    if (isMember) {
      const lastRead = mineMap.get(c.id);
      const [u] = await db
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspaceId),
            eq(messages.channelId, c.id),
            isNull(messages.threadId),
            lastRead ? gt(messages.createdAt, lastRead) : undefined,
            sql`(${messages.authorType} <> 'human' OR ${messages.authorId} IS NULL OR ${messages.authorId} <> ${userId})`,
          ),
        );
      unread = Number(u?.n ?? 0);
    }
    out.push({
      id: c.id,
      name: c.name,
      topic: c.topic,
      memberCount: Number(memberCounts.find((m) => m.channelId === c.id)?.n ?? 0),
      unread,
      isMember,
    });
  }
  return out;
}

export async function channelDTO(
  db: Db,
  workspaceId: string,
  userId: string,
  channelId: string,
): Promise<ChannelDTO | null> {
  const [dto] = await channelDTOs(db, workspaceId, userId, {
    onlyMember: false,
    channelIds: [channelId],
  });
  return dto ?? null;
}

export async function agentDTOs(
  db: Db,
  workspaceId: string,
  status: (agentId: string, deviceId: string) => AgentDTO["status"],
  agentIds?: string[],
): Promise<AgentDTO[]> {
  const rows = await db
    .select({ agent: agents, deviceName: bridgeDevices.name })
    .from(agents)
    .innerJoin(bridgeDevices, eq(bridgeDevices.id, agents.deviceId))
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        isNull(bridgeDevices.revokedAt),
        agentIds ? inArray(agents.id, agentIds.length ? agentIds : ["-"]) : undefined,
      ),
    )
    .orderBy(asc(agents.name));
  const memberships = await db
    .select({ channelId: channelMembers.channelId, memberId: channelMembers.memberId })
    .from(channelMembers)
    .where(
      and(eq(channelMembers.workspaceId, workspaceId), eq(channelMembers.memberType, "agent")),
    );
  return rows.map(({ agent: a, deviceName }) => ({
    id: a.id,
    key: a.key,
    handle: a.handle,
    name: a.name,
    status: status(a.id, a.deviceId),
    loggedIn: a.loggedIn,
    loginCommand: a.loginCommand,
    error: a.error,
    version: a.version,
    deviceId: a.deviceId,
    deviceName,
    configOptions: a.configOptions ?? null,
    canCreateTasks: a.canCreateTasks,
    channelIds: memberships.filter((m) => m.memberId === a.id).map((m) => m.channelId),
  }));
}

export function taskDTO(t: typeof tasks.$inferSelect): TaskDTO {
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    assigneeType: t.assigneeType,
    assigneeId: t.assigneeId,
    channelId: t.channelId,
    threadId: t.threadId,
    sourceMessageId: t.sourceMessageId,
    linkedMessageIds: t.linkedMessageIds ?? [],
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function taskEventDTOs(
  db: Db,
  workspaceId: string,
  taskId: string,
): Promise<TaskEventDTO[]> {
  const rows = await db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.workspaceId, workspaceId), eq(taskEvents.taskId, taskId)))
    .orderBy(asc(taskEvents.createdAt));
  const names = await authorNames(
    db,
    workspaceId,
    rows.map((r) => ({ authorType: r.actorType, authorId: r.actorId })),
  );
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    actorType: r.actorType,
    actorId: r.actorId,
    actorName:
      r.actorType === "system"
        ? "OneSwarm"
        : (names.get(`${r.actorType}:${r.actorId}`) ?? "Someone"),
    type: r.type,
    data: r.data ?? {},
    createdAt: r.createdAt.toISOString(),
  }));
}

export function approvalDTO(a: typeof approvals.$inferSelect): ApprovalDTO {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    title: a.title,
    detail: a.detail as ApprovalDTO["detail"],
    agentId: a.agentId,
    channelId: a.channelId,
    threadId: a.threadId,
    messageId: a.messageId,
    taskId: a.taskId,
    feedback: a.feedback,
    decidedBy: a.decidedBy,
    createdAt: a.createdAt.toISOString(),
  };
}

export function deviceDTO(d: typeof bridgeDevices.$inferSelect, connected: boolean): DeviceDTO {
  return {
    id: d.id,
    name: d.name,
    platform: d.platform,
    connected: connected && !d.revokedAt,
    lastSeenAt: iso(d.lastSeenAt),
    revokedAt: iso(d.revokedAt),
    createdAt: d.createdAt.toISOString(),
  };
}

export async function storageUsed(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number | null>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(eq(files.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}

export async function agentMessagesLastHour(db: Db, workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.authorType, "agent"),
        gt(messages.createdAt, since),
        ne(messages.kind, "approval"),
      ),
    );
  return Number(row?.n ?? 0);
}
