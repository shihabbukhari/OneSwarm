import { z } from "zod";
import type { ConfigOption, PermissionOption, ToolActivity } from "./acp-types";
import type { Role } from "./permissions";

/* ------------------------------------------------------------------ */
/* Data shapes returned by the API                                     */
/* ------------------------------------------------------------------ */

export type AgentStatus = "online" | "working" | "offline";
export type AuthorType = "human" | "agent" | "system";
export type TaskStatus = "todo" | "doing" | "review" | "done";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type ApprovalStatus = "pending" | "approved" | "changes_requested" | "cancelled";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "review", "done"];
export const TASK_PRIORITIES: readonly TaskPriority[] = ["none", "low", "medium", "high", "urgent"];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  doing: "Doing",
  review: "Review",
  done: "Done",
};

export interface UserDTO {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
}

export interface MemberDTO {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface ChannelDTO {
  id: string;
  name: string;
  topic: string;
  memberCount: number;
  unread: number;
  isMember: boolean;
}

export interface AgentDTO {
  id: string;
  key: string;
  handle: string;
  name: string;
  status: AgentStatus;
  loggedIn: boolean;
  loginCommand: string | null;
  error: string | null;
  version: string | null;
  deviceId: string;
  deviceName: string;
  configOptions: ConfigOption[] | null;
  canCreateTasks: boolean;
  channelIds: string[];
}

export interface FileDTO {
  id: string;
  name: string;
  mime: string;
  size: number;
  channelId: string | null;
  taskId: string | null;
  createdAt: string;
  url: string;
}

export interface MessageMeta {
  tools?: ToolActivity[];
  approvalId?: string;
  taskId?: string;
  mentions?: string[];
  error?: string;
  stopReason?: string;
  runId?: string;
  model?: string;
}

export interface MessageDTO {
  id: string;
  clientId: string | null;
  channelId: string;
  threadId: string | null;
  authorType: AuthorType;
  authorId: string | null;
  authorName: string;
  body: string;
  kind: "text" | "approval" | "task" | "system";
  status: "complete" | "streaming" | "error";
  meta: MessageMeta;
  attachments: FileDTO[];
  /** For approval cards: the approval as it was when the message was loaded. */
  approval?: ApprovalDTO | null;
  replyCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDTO {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeType: "human" | "agent" | null;
  assigneeId: string | null;
  channelId: string | null;
  threadId: string | null;
  sourceMessageId: string | null;
  linkedMessageIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEventDTO {
  id: string;
  taskId: string;
  actorType: AuthorType;
  actorId: string | null;
  actorName: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalDTO {
  id: string;
  kind: "permission" | "task_review";
  status: ApprovalStatus;
  title: string;
  detail: {
    toolCall?: Partial<ToolActivity>;
    options?: PermissionOption[];
    summary?: string;
  };
  agentId: string | null;
  channelId: string;
  threadId: string | null;
  messageId: string | null;
  taskId: string | null;
  feedback: string | null;
  decidedBy: string | null;
  createdAt: string;
}

export interface DeviceDTO {
  id: string;
  name: string;
  platform: string;
  connected: boolean;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface LimitsDTO {
  maxFileSizeBytes: number;
  workspaceStorageBytes: number;
  agentMessagesPerHour: number;
  storageUsedBytes: number;
  agentMessagesThisHour: number;
}

export interface BootstrapDTO {
  user: UserDTO;
  workspace: WorkspaceDTO;
  role: Role;
  members: MemberDTO[];
  channels: ChannelDTO[];
  agents: AgentDTO[];
  tasks: TaskDTO[];
  approvals: ApprovalDTO[];
  devices: DeviceDTO[];
  limits: LimitsDTO;
  wsUrl: string;
  bridgeServerUrl: string;
}

/* ------------------------------------------------------------------ */
/* Browser WebSocket                                                    */
/* ------------------------------------------------------------------ */

export const clientEventSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("typing"),
    channelId: z.string().min(1),
    threadId: z.string().nullable().optional(),
  }),
  z.object({ t: z.literal("ping") }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;

export type ServerEvent =
  | { t: "hello"; userId: string }
  | { t: "pong" }
  | { t: "message.created"; message: MessageDTO }
  | { t: "message.updated"; message: MessageDTO }
  | { t: "message.delta"; id: string; channelId: string; threadId: string | null; delta: string }
  | { t: "typing"; channelId: string; threadId: string | null; userId: string; name: string }
  | {
      t: "agent.working";
      agentId: string;
      channelId: string;
      threadId: string | null;
      working: boolean;
    }
  | { t: "channel.created"; channel: ChannelDTO }
  | { t: "channel.updated"; channel: ChannelDTO }
  | { t: "agent.updated"; agent: AgentDTO }
  | { t: "agent.removed"; agentId: string }
  | { t: "task.updated"; task: TaskDTO }
  | { t: "task.event"; event: TaskEventDTO }
  | { t: "approval.updated"; approval: ApprovalDTO }
  | { t: "member.updated"; member: MemberDTO }
  | { t: "member.removed"; userId: string }
  | { t: "device.updated"; device: DeviceDTO }
  | { t: "file.created"; file: FileDTO }
  | { t: "limit"; message: string };

/* ------------------------------------------------------------------ */
/* Bridge <-> server                                                    */
/* ------------------------------------------------------------------ */

const configOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["select", "boolean"]),
    category: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    currentValue: z.union([z.string(), z.boolean()]),
    options: z.array(z.any()).optional(),
  })
  .passthrough();

export const bridgeAgentInfoSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  version: z.string().max(60).nullable().optional(),
  loggedIn: z.boolean(),
  loginCommand: z.string().max(200).nullable().optional(),
  error: z.string().max(500).nullable().optional(),
  configOptions: z.array(configOptionSchema).nullable().optional(),
});
export type BridgeAgentInfo = Omit<z.infer<typeof bridgeAgentInfoSchema>, "configOptions"> & {
  configOptions?: ConfigOption[] | null;
};

export const bridgeToServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    bridgeVersion: z.string().max(40),
    platform: z.string().max(40),
    agents: z.array(bridgeAgentInfoSchema).max(32),
  }),
  z.object({ type: z.literal("agent.status"), agent: bridgeAgentInfoSchema }),
  z.object({
    type: z.literal("agent.config"),
    key: z.string(),
    configOptions: z.array(configOptionSchema),
  }),
  z.object({ type: z.literal("run.session"), runId: z.string(), acpSessionId: z.string() }),
  z.object({
    type: z.literal("run.update"),
    runId: z.string(),
    update: z.object({ sessionUpdate: z.string() }).passthrough(),
  }),
  z.object({
    type: z.literal("run.end"),
    runId: z.string(),
    stopReason: z.string(),
    error: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    type: z.literal("permission.request"),
    runId: z.string(),
    permissionId: z.string(),
    toolCall: z.object({ toolCallId: z.string() }).passthrough(),
    options: z.array(
      z.object({
        optionId: z.string(),
        name: z.string(),
        kind: z.enum(["allow_once", "allow_always", "reject_once", "reject_always"]),
      }),
    ),
  }),
  z.object({ type: z.literal("config.error"), key: z.string(), message: z.string().max(500) }),
  z.object({ type: z.literal("pong") }),
]);
type RawBridgeToServer = z.infer<typeof bridgeToServerSchema>;
export type BridgeToServer =
  | Exclude<RawBridgeToServer, { type: "hello" | "agent.status" | "agent.config" }>
  | { type: "hello"; bridgeVersion: string; platform: string; agents: BridgeAgentInfo[] }
  | { type: "agent.status"; agent: BridgeAgentInfo }
  | { type: "agent.config"; key: string; configOptions: ConfigOption[] };

export type ServerToBridge =
  | { type: "welcome"; workspaceId: string; deviceId: string; deviceName: string }
  | {
      type: "run.start";
      runId: string;
      agentKey: string;
      sessionKey: string;
      acpSessionId: string | null;
      prompt: string;
      config: Record<string, string | boolean>;
      files: { serverUrl: string; token: string } | null;
    }
  | { type: "run.cancel"; runId: string }
  | { type: "config.set"; agentKey: string; configId: string; value: string | boolean }
  | { type: "permission.respond"; permissionId: string; optionId: string | null }
  | { type: "ping" }
  | { type: "revoked" };

export const BRIDGE_PROTOCOL_VERSION = "1";
