/**
 * Who may do what inside a workspace. The server calls these on every request;
 * the web app uses them only to hide controls.
 */

export type Role = "owner" | "member" | "guest";

export type Action =
  | "channel.create"
  | "channel.update"
  | "channel.join_any"
  | "message.post"
  | "message.edit_own"
  | "task.create"
  | "task.update"
  | "task.approve"
  | "approval.decide"
  | "file.upload"
  | "member.invite"
  | "member.manage"
  | "agent.manage"
  | "agent.configure"
  | "agent.mention"
  | "device.pair"
  | "device.manage"
  | "workspace.update";

const MATRIX: Record<Action, readonly Role[]> = {
  "channel.create": ["owner", "member"],
  "channel.update": ["owner", "member"],
  "channel.join_any": ["owner", "member"],
  "message.post": ["owner", "member", "guest"],
  "message.edit_own": ["owner", "member", "guest"],
  "task.create": ["owner", "member", "guest"],
  "task.update": ["owner", "member", "guest"],
  "task.approve": ["owner", "member"],
  "approval.decide": ["owner", "member"],
  "file.upload": ["owner", "member", "guest"],
  "member.invite": ["owner", "member"],
  "member.manage": ["owner"],
  "agent.manage": ["owner", "member"],
  "agent.configure": ["owner", "member"],
  "agent.mention": ["owner", "member", "guest"],
  "device.pair": ["owner", "member"],
  "device.manage": ["owner", "member"],
  "workspace.update": ["owner"],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[action].includes(role);
}

/** Roles a member may hand out when inviting. Only owners can invite owners. */
export function invitableRoles(role: Role): Role[] {
  if (role === "owner") return ["owner", "member", "guest"];
  if (role === "member") return ["member", "guest"];
  return [];
}

export interface ChannelAccess {
  role: Role;
  /** Whether the person is an explicit member of the channel. */
  isMember: boolean;
}

/** Owners and members see every channel; guests only channels they were added to. */
export function canSeeChannel({ role, isMember }: ChannelAccess): boolean {
  if (role === "guest") return isMember;
  return role === "owner" || role === "member";
}

export interface AgentPermissions {
  channelIds: readonly string[];
  canCreateTasks: boolean;
}

/** Agents only act in channels they were added to. */
export function agentCanUseChannel(agent: AgentPermissions, channelId: string): boolean {
  return agent.channelIds.includes(channelId);
}

export function agentCanCreateTask(agent: AgentPermissions, channelId: string | null): boolean {
  if (!agent.canCreateTasks) return false;
  return channelId === null || agent.channelIds.includes(channelId);
}

/** Files an agent may read: only files in channels it belongs to. */
export function filesVisibleToAgent<T extends { channelId: string | null }>(
  agent: AgentPermissions,
  files: readonly T[],
): T[] {
  return files.filter((f) => f.channelId !== null && agent.channelIds.includes(f.channelId));
}

/** A member may change a member's role only if they are an owner and do not demote the last owner. */
export function canChangeRole(params: {
  actorRole: Role;
  targetRole: Role;
  nextRole: Role;
  ownerCount: number;
}): boolean {
  if (params.actorRole !== "owner") return false;
  if (params.targetRole === "owner" && params.nextRole !== "owner" && params.ownerCount <= 1)
    return false;
  return true;
}
