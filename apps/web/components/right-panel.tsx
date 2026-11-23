"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import {
  formatBytes,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type FileDTO,
  type MessageDTO,
  type TaskDTO,
  type TaskEventDTO,
} from "@oneswarm/shared";
import { api } from "@/lib/api";
import { useAgents, useApp, type RightTab } from "@/lib/store";
import { cn, timeLabel } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageList } from "./channel-view";
import { ApprovalCard, Attachment } from "./message";
import { Button } from "./ui/button";
import { Input, Label, Select, Textarea } from "./ui/input";
import { Skeleton, StatusDot } from "./ui/bits";

const EMPTY_MESSAGES: MessageDTO[] = [];

const TABS: Array<{ id: RightTab; label: string }> = [
  { id: "details", label: "Task" },
  { id: "thread", label: "Thread" },
  { id: "files", label: "Files" },
  { id: "approvals", label: "Approvals" },
  { id: "agents", label: "Agents" },
];

export function RightPanel() {
  const right = useApp((s) => s.right);
  const setRight = useApp((s) => s.setRight);
  const pending = useApp((s) => s.boot?.approvals.length ?? 0);
  return (
    <aside aria-label="Details" className="flex h-full min-w-0 flex-col" data-testid="right-panel">
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-hair px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setRight({ tab: t.id })}
            aria-pressed={right.tab === t.id}
            className={cn(
              "rounded-full px-2.5 py-1 text-[13px] text-ash transition-colors duration-[120ms] hover:text-paper",
              right.tab === t.id && "bg-lift-2 text-paper",
            )}
          >
            {t.label}
            {t.id === "approvals" && pending ? (
              <span className="ml-1 font-mono text-[11px] text-ember">{pending}</span>
            ) : null}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close panel"
          onClick={() => setRight({ open: false })}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {right.tab === "details" ? <TaskDetail taskId={right.taskId} /> : null}
        {right.tab === "thread" ? <ThreadPane rootId={right.threadId} /> : null}
        {right.tab === "files" ? <FilesPane /> : null}
        {right.tab === "approvals" ? <ApprovalQueue /> : null}
        {right.tab === "agents" ? <AgentStatusPane /> : null}
      </div>
    </aside>
  );
}

function PaneEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-10">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] text-ash">{body}</p>
    </div>
  );
}

function ApprovalQueue() {
  const approvals = useApp((s) => s.boot?.approvals ?? []);
  const channels = useApp((s) => s.boot?.channels ?? []);
  if (!approvals.length)
    return (
      <PaneEmpty
        title="Nothing waiting"
        body="When an agent asks for permission or a task needs review, it appears here."
      />
    );
  return (
    <div className="space-y-3 p-4" data-testid="approval-queue">
      {approvals.map((a) => (
        <div key={a.id}>
          <p className="eyebrow">
            #{channels.find((c) => c.id === a.channelId)?.name ?? "channel"}
          </p>
          <ApprovalCard approvalId={a.id} compact />
        </div>
      ))}
    </div>
  );
}

function AgentStatusPane() {
  const agents = useAgents();
  const set = useApp((s) => s.set);
  if (!agents.length) {
    return (
      <div className="p-5">
        <PaneEmpty
          title="No agents connected"
          body="Run the bridge on a computer with Claude, Codex or Gemini installed."
        />
        <Button variant="light" onClick={() => set({ connect: true })}>
          Connect agents
        </Button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-hair">
      {agents.map((a) => (
        <li key={a.id} className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <StatusDot status={a.status} />
            <span className="text-[14px] font-medium">{a.name}</span>
            <span className="font-mono text-[11px] text-smoke">@{a.handle}</span>
            <span className="eyebrow ml-auto">{a.status}</span>
          </div>
          <p className="mt-0.5 text-[12px] text-ash">
            on {a.deviceName}
            {a.version ? ` · v${a.version}` : ""}
          </p>
          {!a.loggedIn && a.loginCommand ? (
            <p className="mt-1.5 text-[12px] text-fog">
              Not logged in. On that computer run{" "}
              <code className="rounded bg-lift-2 px-1 font-mono">{a.loginCommand}</code>
            </p>
          ) : null}
          {a.error ? <p className="mt-1 text-[12px] text-ember">{a.error}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function FilesPane() {
  const channelId = useApp((s) => s.activeChannelId);
  const files = useApp((s) => (channelId ? s.files[channelId] : undefined));
  const loadFiles = useApp((s) => s.loadFiles);
  useEffect(() => {
    if (channelId) void loadFiles(channelId).catch(() => undefined);
  }, [channelId, loadFiles]);
  if (!channelId)
    return <PaneEmpty title="No channel open" body="Open a channel to see its files." />;
  if (!files)
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  if (!files.length)
    return (
      <PaneEmpty
        title="No files yet"
        body="Attach files in the message box. Agents in this channel can read them."
      />
    );
  return (
    <ul className="space-y-1 p-3">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-image px-2 py-2 hover:bg-lift-2"
          >
            <FileText className="size-4 text-ash" />
            <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
            <span className="font-mono text-[11px] text-smoke">{formatBytes(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ThreadPane({ rootId }: { rootId: string | null }) {
  if (!rootId)
    return <PaneEmpty title="No thread open" body="Hover a message and choose Reply in thread." />;
  return <ThreadPaneInner key={rootId} rootId={rootId} />;
}

function ThreadPaneInner({ rootId }: { rootId: string }) {
  const replies = useApp((s) => (rootId ? s.threads[rootId] : undefined)) ?? EMPTY_MESSAGES;
  const loaded = useApp((s) => (rootId ? rootId in s.threads : false));
  const [root, setRoot] = useState<MessageDTO | null>(null);
  useEffect(() => {
    api<{ root: MessageDTO }>(`/messages/${rootId}/thread`).then(
      (r) => setRoot(r.root),
      () => setRoot(null),
    );
  }, [rootId]);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        {root ? (
          <MessageList messages={[root]} inThread />
        ) : (
          <Skeleton className="mx-5 my-3 h-10" />
        )}
        <div className="mx-5 my-2 flex items-center gap-3">
          <span className="eyebrow">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <span className="h-px flex-1 bg-hair" />
        </div>
        <MessageList messages={replies} loading={!loaded} inThread />
      </div>
      {root ? <Composer channelId={root.channelId} threadId={root.id} /> : null}
    </div>
  );
}

const EVENT_TEXT: Record<string, (e: TaskEventDTO) => string> = {
  created: () => "created the task",
  status: (e) =>
    `moved it to ${TASK_STATUS_LABEL[e.data.to as keyof typeof TASK_STATUS_LABEL] ?? e.data.to}`,
  assigned: () => "changed the assignee",
  updated: (e) => `updated ${String(e.data.field)}`,
  changes_requested: (e) => `requested changes${e.data.feedback ? `: “${e.data.feedback}”` : ""}`,
  run_failed: (e) => `couldn't run: ${String(e.data.reason ?? "")}`,
};

export function TaskDetail({ taskId }: { taskId: string | null }) {
  if (!taskId)
    return (
      <PaneEmpty
        title="No task selected"
        body="Pick a task from Tasks, or create one from any message."
      />
    );
  return <TaskDetailInner key={taskId} taskId={taskId} />;
}

function TaskDetailInner({ taskId }: { taskId: string }) {
  const task = useApp((s) => s.boot?.tasks.find((t) => t.id === taskId));
  const events = useApp((s) => (taskId ? s.taskEvents[taskId] : undefined));
  const members = useApp((s) => s.boot?.members ?? []);
  const agents = useAgents();
  const approvals = useApp((s) => s.boot?.approvals ?? []);
  const updateTask = useApp((s) => s.updateTask);
  const openThread = useApp((s) => s.openThread);
  const showToast = useApp((s) => s.showToast);
  const [detail, setDetail] = useState<{
    deliverables: FileDTO[];
    linkedMessages: MessageDTO[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{
      task: TaskDTO;
      events: TaskEventDTO[];
      deliverables: FileDTO[];
      linkedMessages: MessageDTO[];
    }>(`/tasks/${taskId}`).then(
      (r) => {
        useApp.setState((s) => ({ taskEvents: { ...s.taskEvents, [taskId]: r.events } }));
        setDetail({ deliverables: r.deliverables, linkedMessages: r.linkedMessages });
      },
      () => undefined,
    );
  }, [taskId]);
  if (!task)
    return (
      <PaneEmpty
        title="No task selected"
        body="Pick a task from Tasks, or create one from any message."
      />
    );
  const review = approvals.find((a) => a.kind === "task_review" && a.taskId === task.id);
  const assigneeValue = task.assigneeId ? `${task.assigneeType}:${task.assigneeId}` : "";

  async function addDeliverable(files: FileList | null) {
    if (!files?.length || !task) return;
    const form = new FormData();
    form.append("taskId", task.id);
    if (task.channelId) form.append("channelId", task.channelId);
    form.append("file", files[0]!);
    try {
      const res = await api<{ file: FileDTO }>("/files", { form });
      setDetail((d) => (d ? { ...d, deliverables: [...d.deliverables, res.file] } : d));
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  return (
    <div className="space-y-5 p-5" data-testid="task-detail" data-status={task.status}>
      <div>
        <span className="eyebrow">OS-{task.number}</span>
        <Input
          key={task.title}
          aria-label="Task title"
          defaultValue={task.title}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== task.title) void updateTask(task.id, { title });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="mt-1 h-auto border-transparent bg-transparent px-0 text-[18px] font-medium hover:border-hair focus:border-hair focus:px-2"
        />
      </div>
      <div className="grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
        <span className="text-ash">Status</span>
        <Select
          aria-label="Status"
          data-testid="task-status"
          value={task.status}
          onChange={(e) =>
            void updateTask(task.id, { status: e.target.value as TaskDTO["status"] })
          }
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <span className="text-ash">Assignee</span>
        <Select
          aria-label="Assignee"
          data-testid="task-assignee"
          value={assigneeValue}
          onChange={(e) => {
            const [type, id] = e.target.value.split(":");
            void updateTask(task.id, {
              assigneeType: (type || null) as TaskDTO["assigneeType"],
              assigneeId: id || null,
            });
          }}
        >
          <option value="">Unassigned</option>
          <optgroup label="Agents">
            {agents.map((a) => (
              <option key={a.id} value={`agent:${a.id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="People">
            {members.map((m) => (
              <option key={m.userId} value={`human:${m.userId}`}>
                {m.name}
              </option>
            ))}
          </optgroup>
        </Select>
        <span className="text-ash">Priority</span>
        <Select
          aria-label="Priority"
          value={task.priority}
          onChange={(e) =>
            void updateTask(task.id, { priority: e.target.value as TaskDTO["priority"] })
          }
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === "none" ? "No priority" : p[0]!.toUpperCase() + p.slice(1)}
            </option>
          ))}
        </Select>
        <span className="text-ash">Due</span>
        <Input
          aria-label="Due date"
          type="date"
          className="h-8 text-[13px]"
          value={task.dueDate ?? ""}
          onChange={(e) => void updateTask(task.id, { dueDate: e.target.value || null })}
        />
      </div>
      {review ? <ApprovalCard approvalId={review.id} /> : null}
      <div>
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          key={task.description}
          rows={4}
          defaultValue={task.description}
          onBlur={(e) =>
            e.target.value !== task.description &&
            void updateTask(task.id, { description: e.target.value })
          }
          placeholder="Add details…"
          className="mt-1"
        />
      </div>
      {task.threadId ? (
        <button
          type="button"
          onClick={() => openThread(task.threadId!)}
          className="text-[13px] text-fog underline-offset-4 hover:text-paper hover:underline"
        >
          Open the work thread
        </button>
      ) : null}
      <div>
        <span className="eyebrow">Linked messages</span>
        {detail?.linkedMessages.length ? (
          <ul className="mt-1 space-y-1">
            {detail.linkedMessages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openThread(m.threadId ?? m.id)}
                  className="w-full truncate rounded-chip px-2 py-1 text-left text-[13px] text-fog hover:bg-lift-2"
                >
                  <span className="text-paper">{m.authorName}:</span> {m.body}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-smoke">None</p>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="eyebrow">Deliverables</span>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload /> Add
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => void addDeliverable(e.target.files)}
          />
        </div>
        {detail?.deliverables.length ? (
          detail.deliverables.map((f) => <Attachment key={f.id} file={f} />)
        ) : (
          <p className="mt-1 text-[13px] text-smoke">None yet</p>
        )}
      </div>
      <div>
        <span className="eyebrow">Activity</span>
        <ol className="mt-1 space-y-1.5" data-testid="task-activity">
          {(events ?? []).map((e) => (
            <li key={e.id} className="text-[13px] text-ash">
              <span className="text-paper">{e.actorName}</span>{" "}
              {(EVENT_TEXT[e.type] ?? (() => e.type))(e)}
              <span className="ml-1.5 text-[11px] text-smoke">{timeLabel(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
