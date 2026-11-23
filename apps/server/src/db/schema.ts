import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ConfigOption, MessageMeta } from "@oneswarm/shared";

const id = () => text("id").primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token. The raw token only lives in the cookie. */
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  taskCounter: integer("task_counter").notNull().default(0),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member", "guest"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // One workspace per account.
    uniqueIndex("workspace_members_user_unique").on(t.userId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["owner", "member", "guest"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invites_workspace_idx").on(t.workspaceId)],
);

export const channels = pgTable(
  "channels",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    topic: text("topic").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channels_workspace_name_unique").on(t.workspaceId, t.name)],
);

export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    memberType: text("member_type", { enum: ["human", "agent"] }).notNull(),
    memberId: text("member_id").notNull(),
    lastReadAt: ts("last_read_at"),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.memberType, t.memberId] }),
    index("channel_members_member_idx").on(t.workspaceId, t.memberType, t.memberId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    /** Root message id when this message is a thread reply. */
    threadId: text("thread_id"),
    clientId: text("client_id"),
    authorType: text("author_type", { enum: ["human", "agent", "system"] }).notNull(),
    authorId: text("author_id"),
    body: text("body").notNull().default(""),
    kind: text("kind", { enum: ["text", "approval", "task", "system"] })
      .notNull()
      .default("text"),
    status: text("status", { enum: ["complete", "streaming", "error"] })
      .notNull()
      .default("complete"),
    meta: jsonb("meta").$type<MessageMeta>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_ws_channel_created_idx").on(t.workspaceId, t.channelId, t.createdAt),
    index("messages_thread_idx").on(t.workspaceId, t.threadId, t.createdAt),
  ],
);

export const files = pgTable(
  "files",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: text("channel_id").references(() => channels.id, { onDelete: "set null" }),
    taskId: text("task_id"),
    uploadedByType: text("uploaded_by_type", { enum: ["human", "agent"] }).notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("files_ws_channel_created_idx").on(t.workspaceId, t.channelId, t.createdAt),
    index("files_task_idx").on(t.workspaceId, t.taskId),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.fileId] })],
);

export const bridgeDevices = pgTable(
  "bridge_devices",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform").notNull().default(""),
    /** SHA-256 of the device token. */
    tokenHash: text("token_hash").notNull().unique(),
    lastSeenAt: ts("last_seen_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("bridge_devices_workspace_idx").on(t.workspaceId)],
);

export const pairingCodes = pgTable("pairing_codes", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  deviceId: text("device_id"),
  createdAt: createdAt(),
});

export const agents = pgTable(
  "agents",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => bridgeDevices.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    loggedIn: boolean("logged_in").notNull().default(false),
    loginCommand: text("login_command"),
    error: text("error"),
    configOptions: jsonb("config_options").$type<ConfigOption[] | null>(),
    canCreateTasks: boolean("can_create_tasks").notNull().default(true),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agents_workspace_handle_unique").on(t.workspaceId, t.handle),
    uniqueIndex("agents_device_key_unique").on(t.deviceId, t.key),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    /** Root message id of the thread, or null for the channel's main timeline. */
    threadId: text("thread_id"),
    acpSessionId: text("acp_session_id"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("agent_sessions_lookup_idx").on(t.workspaceId, t.agentId, t.channelId, t.threadId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    channelId: text("channel_id").references(() => channels.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assigneeType: text("assignee_type", { enum: ["human", "agent"] }),
    assigneeId: text("assignee_id"),
    status: text("status", { enum: ["todo", "doing", "review", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["none", "low", "medium", "high", "urgent"] })
      .notNull()
      .default("none"),
    dueDate: text("due_date"),
    createdBy: text("created_by").notNull(),
    threadId: text("thread_id"),
    sourceMessageId: text("source_message_id"),
    linkedMessageIds: jsonb("linked_message_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tasks_workspace_number_unique").on(t.workspaceId, t.number),
    index("tasks_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["human", "agent", "system"] }).notNull(),
    actorId: text("actor_id"),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("task_events_task_idx").on(t.workspaceId, t.taskId, t.createdAt)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    messageId: text("message_id"),
    agentId: text("agent_id"),
    runId: text("run_id"),
    permissionId: text("permission_id"),
    taskId: text("task_id"),
    kind: text("kind", { enum: ["permission", "task_review"] }).notNull(),
    title: text("title").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["pending", "approved", "changes_requested", "cancelled"] })
      .notNull()
      .default("pending"),
    feedback: text("feedback"),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_ws_status_idx").on(t.workspaceId, t.status, t.createdAt)],
);
