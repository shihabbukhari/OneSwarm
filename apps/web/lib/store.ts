"use client";
import { create } from "zustand";
import {
  withValue,
  type AgentDTO,
  type ApprovalDTO,
  type BootstrapDTO,
  type ChannelDTO,
  type ConfigOption,
  type DeviceDTO,
  type FileDTO,
  type MemberDTO,
  type MessageDTO,
  type ServerEvent,
  type TaskDTO,
  type TaskEventDTO,
} from "@oneswarm/shared";
import { api } from "./api";

export type RightTab = "details" | "thread" | "files" | "approvals" | "agents";

interface TypingEntry {
  userId: string;
  name: string;
  threadId: string | null;
  at: number;
}

interface State {
  boot: BootstrapDTO | null;
  bootError: string | null;
  connected: boolean;
  activeChannelId: string | null;
  messages: Record<string, MessageDTO[]>;
  hasMore: Record<string, boolean>;
  threads: Record<string, MessageDTO[]>;
  files: Record<string, FileDTO[]>;
  taskEvents: Record<string, TaskEventDTO[]>;
  typing: Record<string, TypingEntry[]>;
  /** Optimistic config values until the agent confirms them. */
  pendingConfig: Record<string, Record<string, string | boolean>>;
  right: { open: boolean; tab: RightTab; taskId: string | null; threadId: string | null };
  leftCollapsed: boolean;
  selectedApprovalId: string | null;
  palette: boolean;
  shortcuts: boolean;
  modelPicker: boolean;
  newTask: {
    open: boolean;
    title?: string;
    description?: string;
    sourceMessageId?: string | null;
    assignee?: string | null;
  };
  newChannel: boolean;
  invite: boolean;
  connect: boolean;
  composerAgent: Record<string, string | null>;
  composerSeed: { channelId: string; text: string } | null;
  toast: string | null;
  recent: Array<{ kind: "channel" | "task" | "agent"; id: string }>;

  load(): Promise<void>;
  applyEvent(ev: ServerEvent): void;
  setActiveChannel(id: string | null): void;
  loadChannel(id: string, older?: boolean): Promise<void>;
  loadThread(rootId: string): Promise<void>;
  loadFiles(channelId: string): Promise<void>;
  sendMessage(input: {
    channelId: string;
    body: string;
    threadId?: string | null;
    attachments?: FileDTO[];
  }): Promise<MessageDTO | null>;
  setRight(patch: Partial<State["right"]>): void;
  toggleRight(): void;
  toggleLeft(): void;
  openTask(id: string): void;
  openThread(id: string): void;
  setConfig(agent: AgentDTO, configId: string, value: string | boolean): Promise<void>;
  effectiveOptions(agent: AgentDTO): ConfigOption[] | null;
  decide(approvalId: string, decision: "approve" | "changes", feedback?: string): Promise<void>;
  updateTask(id: string, patch: Partial<TaskDTO>): Promise<void>;
  showToast(text: string): void;
  set(patch: Partial<State>): void;
  pushRecent(item: State["recent"][number]): void;
}

const byCreated = (a: MessageDTO, b: MessageDTO) => a.createdAt.localeCompare(b.createdAt);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const out = list.slice();
  out[i] = item;
  return out;
}

/** Insert or replace a message, reconciling an optimistic copy by clientId. */
function placeMessage(list: MessageDTO[], msg: MessageDTO): MessageDTO[] {
  let out = list;
  if (msg.clientId)
    out = out.filter((m) => !(m.id.startsWith("tmp-") && m.clientId === msg.clientId));
  const i = out.findIndex((m) => m.id === msg.id);
  if (i >= 0) {
    out = out.slice();
    // Keep streamed text if an update raced ahead of the final body.
    out[i] = msg;
    return out;
  }
  return [...out, msg].sort(byCreated);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useApp = create<State>((set, get) => ({
  boot: null,
  bootError: null,
  connected: false,
  activeChannelId: null,
  messages: {},
  hasMore: {},
  threads: {},
  files: {},
  taskEvents: {},
  typing: {},
  pendingConfig: {},
  right: { open: false, tab: "approvals", taskId: null, threadId: null },
  leftCollapsed: false,
  selectedApprovalId: null,
  palette: false,
  shortcuts: false,
  modelPicker: false,
  newTask: { open: false },
  newChannel: false,
  invite: false,
  connect: false,
  composerAgent: {},
  composerSeed: null,
  toast: null,
  recent: [],

  set: (patch) => set(patch),

  async load() {
    try {
      const boot = await api<BootstrapDTO>("/bootstrap");
      set({ boot, bootError: null });
    } catch (err) {
      set({ bootError: (err as Error).message });
      throw err;
    }
  },

  setActiveChannel(id) {
    set({ activeChannelId: id });
    const boot = get().boot;
    if (id && boot) {
      set({
        boot: {
          ...boot,
          channels: boot.channels.map((c) =>
            c.id === id ? { ...c, unread: 0, isMember: true } : c,
          ),
        },
      });
      void api(`/channels/${id}/read`, { method: "POST" }).catch(() => undefined);
      get().pushRecent({ kind: "channel", id });
    }
  },

  async loadChannel(id, older = false) {
    const existing = get().messages[id] ?? [];
    const before =
      older && existing[0] ? `&before=${encodeURIComponent(existing[0].createdAt)}` : "";
    const res = await api<{ messages: MessageDTO[]; hasMore: boolean }>(
      `/channels/${id}/messages?limit=50${before}`,
    );
    set((s) => {
      // Merge with what is in the store *now*: messages may have arrived while loading.
      const current = s.messages[id] ?? [];
      const unique = new Map<string, MessageDTO>();
      for (const m of current) unique.set(m.id, m);
      for (const m of res.messages) {
        const live = unique.get(m.id);
        // Keep a live streaming copy; it is ahead of the stored body.
        if (!(live && live.status === "streaming" && m.status === "streaming")) unique.set(m.id, m);
      }
      const confirmed = new Set(
        [...unique.values()]
          .filter((m) => !m.id.startsWith("tmp-") && m.clientId)
          .map((m) => m.clientId),
      );
      const list = [...unique.values()].filter(
        (m) => !(m.id.startsWith("tmp-") && confirmed.has(m.clientId)),
      );
      return {
        messages: { ...s.messages, [id]: list.sort(byCreated) },
        hasMore: {
          ...s.hasMore,
          [id]: older || !current.length ? res.hasMore : (s.hasMore[id] ?? res.hasMore),
        },
      };
    });
  },

  async loadThread(rootId) {
    const res = await api<{ root: MessageDTO; replies: MessageDTO[] }>(
      `/messages/${rootId}/thread`,
    );
    set((s) => ({ threads: { ...s.threads, [rootId]: res.replies } }));
  },

  async loadFiles(channelId) {
    const res = await api<{ files: FileDTO[] }>(`/channels/${channelId}/files`);
    set((s) => ({ files: { ...s.files, [channelId]: res.files } }));
  },

  async sendMessage({ channelId, body, threadId = null, attachments = [] }) {
    const boot = get().boot;
    if (!boot) return null;
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();
    const temp: MessageDTO = {
      id: `tmp-${clientId}`,
      clientId,
      channelId,
      threadId,
      authorType: "human",
      authorId: boot.user.id,
      authorName: boot.user.name,
      body,
      kind: "text",
      status: "streaming",
      meta: {},
      attachments,
      replyCount: 0,
      lastReplyAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const place = (m: MessageDTO) =>
      set((s) =>
        m.threadId
          ? {
              threads: { ...s.threads, [m.threadId]: placeMessage(s.threads[m.threadId] ?? [], m) },
            }
          : {
              messages: {
                ...s.messages,
                [channelId]: placeMessage(s.messages[channelId] ?? [], m),
              },
            },
      );
    place(temp);
    try {
      const res = await api<{ message: MessageDTO }>(`/channels/${channelId}/messages`, {
        body: { body, clientId, threadId, attachmentIds: attachments.map((a) => a.id) },
      });
      place(res.message);
      return res.message;
    } catch (err) {
      place({ ...temp, status: "error", meta: { error: (err as Error).message } });
      get().showToast((err as Error).message);
      return null;
    }
  },

  setRight(patch) {
    set((s) => ({ right: { ...s.right, ...patch } }));
  },
  toggleRight() {
    set((s) => ({ right: { ...s.right, open: !s.right.open } }));
  },
  toggleLeft() {
    set((s) => ({ leftCollapsed: !s.leftCollapsed }));
  },
  openTask(id) {
    set((s) => ({ right: { ...s.right, open: true, tab: "details", taskId: id } }));
    get().pushRecent({ kind: "task", id });
  },
  openThread(id) {
    set((s) => ({ right: { ...s.right, open: true, tab: "thread", threadId: id } }));
    void get().loadThread(id);
  },

  effectiveOptions(agent) {
    const pending = get().pendingConfig[agent.id];
    let options = agent.configOptions;
    if (!options) return null;
    if (pending)
      for (const [id, value] of Object.entries(pending)) options = withValue(options, id, value);
    return options;
  },

  async setConfig(agent, configId, value) {
    set((s) => ({
      pendingConfig: {
        ...s.pendingConfig,
        [agent.id]: { ...(s.pendingConfig[agent.id] ?? {}), [configId]: value },
      },
    }));
    try {
      await api(`/agents/${agent.id}/config`, { body: { configId, value } });
    } catch (err) {
      set((s) => {
        const next = { ...(s.pendingConfig[agent.id] ?? {}) };
        delete next[configId];
        return { pendingConfig: { ...s.pendingConfig, [agent.id]: next } };
      });
      get().showToast((err as Error).message);
    }
  },

  async decide(approvalId, decision, feedback) {
    try {
      const res = await api<{ approval: ApprovalDTO }>(`/approvals/${approvalId}/decide`, {
        body: { decision, feedback },
      });
      get().applyEvent({ t: "approval.updated", approval: res.approval });
    } catch (err) {
      get().showToast((err as Error).message);
    }
  },

  async updateTask(id, patch) {
    try {
      const res = await api<{ task: TaskDTO }>(`/tasks/${id}`, { method: "PATCH", body: patch });
      get().applyEvent({ t: "task.updated", task: res.task });
    } catch (err) {
      get().showToast((err as Error).message);
    }
  },

  showToast(text) {
    set({ toast: text });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 4000);
  },

  pushRecent(item) {
    set((s) => ({
      recent: [item, ...s.recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(
        0,
        8,
      ),
    }));
  },

  applyEvent(ev) {
    const s = get();
    const boot = s.boot;
    switch (ev.t) {
      case "message.created":
      case "message.updated": {
        const m = ev.message;
        if (m.threadId) {
          set((st) => ({
            threads: {
              ...st.threads,
              [m.threadId!]: placeMessage(st.threads[m.threadId!] ?? [], m),
            },
          }));
          return;
        }
        set((st) => ({
          messages: {
            ...st.messages,
            [m.channelId]: placeMessage(st.messages[m.channelId] ?? [], m),
          },
        }));
        if (
          ev.t === "message.created" &&
          boot &&
          m.channelId !== s.activeChannelId &&
          !(m.authorType === "human" && m.authorId === boot.user.id)
        ) {
          set({
            boot: {
              ...boot,
              channels: boot.channels.map((c) =>
                c.id === m.channelId && c.isMember ? { ...c, unread: c.unread + 1 } : c,
              ),
            },
          });
        } else if (ev.t === "message.created" && m.channelId === s.activeChannelId) {
          void api(`/channels/${m.channelId}/read`, { method: "POST" }).catch(() => undefined);
        }
        // Clear the typing indicator of whoever just posted.
        if (m.authorType === "human" && m.authorId) {
          set((st) => ({
            typing: {
              ...st.typing,
              [m.channelId]: (st.typing[m.channelId] ?? []).filter((t) => t.userId !== m.authorId),
            },
          }));
        }
        return;
      }
      case "message.delta": {
        const apply = (list: MessageDTO[] | undefined) =>
          (list ?? []).map((m) =>
            m.id === ev.id ? { ...m, body: m.body + ev.delta, status: "streaming" as const } : m,
          );
        if (ev.threadId)
          set((st) => ({
            threads: { ...st.threads, [ev.threadId!]: apply(st.threads[ev.threadId!]) },
          }));
        else
          set((st) => ({
            messages: { ...st.messages, [ev.channelId]: apply(st.messages[ev.channelId]) },
          }));
        return;
      }
      case "typing": {
        const entry = { userId: ev.userId, name: ev.name, threadId: ev.threadId, at: Date.now() };
        set((st) => ({
          typing: {
            ...st.typing,
            [ev.channelId]: [
              ...(st.typing[ev.channelId] ?? []).filter((t) => t.userId !== ev.userId),
              entry,
            ],
          },
        }));
        return;
      }
      case "channel.created":
      case "channel.updated": {
        if (!boot) return;
        const existing = boot.channels.find((c) => c.id === ev.channel.id);
        const channel: ChannelDTO = existing
          ? {
              ...ev.channel,
              isMember: existing.isMember || ev.channel.isMember,
              unread: existing.unread,
            }
          : ev.channel;
        set({
          boot: {
            ...boot,
            channels: upsert(boot.channels, channel).sort((a, b) => a.name.localeCompare(b.name)),
          },
        });
        return;
      }
      case "agent.updated": {
        if (!boot) return;
        // The agent confirmed its options: drop optimistic values.
        const pending = { ...s.pendingConfig };
        delete pending[ev.agent.id];
        set({ boot: { ...boot, agents: upsert(boot.agents, ev.agent) }, pendingConfig: pending });
        return;
      }
      case "agent.removed":
        if (boot)
          set({ boot: { ...boot, agents: boot.agents.filter((a) => a.id !== ev.agentId) } });
        return;
      case "task.updated": {
        if (!boot) return;
        // An HTTP response can arrive after a newer realtime update: keep the newest.
        const existing = boot.tasks.find((t) => t.id === ev.task.id);
        if (existing && existing.updatedAt > ev.task.updatedAt) return;
        set({
          boot: { ...boot, tasks: upsert(boot.tasks, ev.task).sort((a, b) => a.number - b.number) },
        });
        return;
      }
      case "task.event":
        set((st) => ({
          taskEvents: {
            ...st.taskEvents,
            [ev.event.taskId]: upsert(st.taskEvents[ev.event.taskId] ?? [], ev.event),
          },
        }));
        return;
      case "approval.updated": {
        if (!boot) return;
        const approvals =
          ev.approval.status === "pending"
            ? upsert(boot.approvals, ev.approval)
            : boot.approvals.filter((a) => a.id !== ev.approval.id);
        // Keep decided approvals around for cards that render their state.
        decided.set(ev.approval.id, ev.approval);
        set({ boot: { ...boot, approvals } });
        if (ev.approval.status === "pending") {
          // An agent is waiting: open the right panel on the approval queue,
          // unless the person is already looking at the task this review is for.
          set((st) => {
            const viewingTask =
              st.right.open &&
              st.right.tab === "details" &&
              !!ev.approval.taskId &&
              st.right.taskId === ev.approval.taskId;
            return {
              right: { ...st.right, open: true, tab: viewingTask ? "details" : "approvals" },
              selectedApprovalId: ev.approval.id,
            };
          });
        }
        return;
      }
      case "member.updated":
        if (boot) set({ boot: { ...boot, members: upsertMember(boot.members, ev.member) } });
        return;
      case "member.removed":
        if (boot)
          set({ boot: { ...boot, members: boot.members.filter((m) => m.userId !== ev.userId) } });
        return;
      case "device.updated":
        if (boot)
          set({
            boot: {
              ...boot,
              devices: upsert(boot.devices, ev.device as DeviceDTO).filter((d) => !d.revokedAt),
            },
          });
        return;
      case "file.created": {
        const f = ev.file;
        if (f.channelId)
          set((st) => ({
            files: {
              ...st.files,
              [f.channelId!]: [f, ...(st.files[f.channelId!] ?? []).filter((x) => x.id !== f.id)],
            },
          }));
        return;
      }
      case "limit":
        s.showToast(ev.message);
        return;
      default:
        return;
    }
  },
}));

function upsertMember(list: MemberDTO[], m: MemberDTO): MemberDTO[] {
  const i = list.findIndex((x) => x.userId === m.userId);
  if (i === -1) return [...list, m];
  const out = list.slice();
  out[i] = m;
  return out;
}

/** Decided approvals, so cards in the channel can show "Approved" after leaving the queue. */
export const decided = new Map<string, ApprovalDTO>();

export function useApproval(
  id: string | undefined,
  fallback?: ApprovalDTO | null,
): ApprovalDTO | undefined {
  const pending = useApp((s) => (id ? s.boot?.approvals.find((a) => a.id === id) : undefined));
  useApp((s) => s.boot?.approvals.length); // re-render when the queue changes
  return pending ?? (id ? decided.get(id) : undefined) ?? fallback ?? undefined;
}

export const useAgents = () => useApp((s) => s.boot?.agents ?? EMPTY_AGENTS);
const EMPTY_AGENTS: AgentDTO[] = [];
