"use client";
import { memo, useState } from "react";
import { ChevronRight, FileText, ListTodo, MessageSquare, Paperclip } from "lucide-react";
import {
  formatBytes,
  summarizeToolActivity,
  type ApprovalDTO,
  type FileDTO,
  type MessageDTO,
  type ToolActivity,
} from "@oneswarm/shared";
import { useApp, useApproval } from "@/lib/store";
import { cn, timeLabel } from "@/lib/utils";
import { Avatar } from "./ui/bits";
import { Button } from "./ui/button";
import { Tip } from "./ui/tooltip";
import { Markdown } from "./markdown";
import { Textarea } from "./ui/input";

export function ToolActivityLine({ tools }: { tools: ToolActivity[] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  const running = tools.some((t) => t.status === "pending" || t.status === "in_progress");
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1 rounded-full py-0.5 pr-2 text-[13px] text-ash transition-colors duration-[120ms] hover:text-paper"
      >
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform duration-[120ms] ease-out",
            open && "rotate-90",
          )}
        />
        <span data-testid="tool-summary">{summarizeToolActivity(tools)}</span>
        {running ? (
          <span className="ml-1 size-1.5 animate-pulse-dot rounded-full bg-ember" />
        ) : null}
      </button>
      {open ? (
        <ul className="mt-1 space-y-2 border-l border-hair pl-3">
          {tools.map((t) => (
            <li key={t.id} className="text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase text-smoke">{t.kind}</span>
                <span className="text-fog">{t.title}</span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    t.status === "failed" ? "text-ember" : "text-smoke",
                  )}
                >
                  {t.status.replace("_", " ")}
                </span>
              </div>
              {t.diffs.map((d) => (
                <pre
                  key={d.path}
                  className="mt-1.5 overflow-x-auto rounded-image border border-hair bg-void p-2.5 font-mono text-[12px] leading-[1.55]"
                >
                  <div className="mb-1 text-smoke">{d.path}</div>
                  {diffLines(d.oldText ?? "", d.newText).map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.type === "add"
                          ? "text-[#b8e0c2]"
                          : l.type === "del"
                            ? "text-[#ff9a85]"
                            : "text-ash"
                      }
                    >
                      {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}
                      {l.text}
                    </div>
                  ))}
                </pre>
              ))}
              {t.output ? (
                <pre className="mt-1.5 max-h-40 overflow-auto rounded-image bg-void p-2.5 font-mono text-[12px] text-ash">
                  {t.output}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Minimal line diff (LCS) for small agent edits. */
function diffLines(a: string, b: string): Array<{ type: "same" | "add" | "del"; text: string }> {
  const x = a.split("\n");
  const y = b.split("\n");
  if (x.length * y.length > 40_000)
    return [
      ...x.map((t) => ({ type: "del" as const, text: t })),
      ...y.map((t) => ({ type: "add" as const, text: t })),
    ];
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<{ type: "same" | "add" | "del"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ type: "same", text: x[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ type: "del", text: x[i++]! });
    else out.push({ type: "add", text: y[j++]! });
  }
  while (i < x.length) out.push({ type: "del", text: x[i++]! });
  while (j < y.length) out.push({ type: "add", text: y[j++]! });
  return out;
}

export function ApprovalCard({
  approvalId,
  compact = false,
  fallback,
}: {
  approvalId: string;
  compact?: boolean;
  fallback?: ApprovalDTO | null;
}) {
  const approval = useApproval(approvalId, fallback);
  const decide = useApp((s) => s.decide);
  const selected = useApp((s) => s.selectedApprovalId === approvalId);
  const agent = useApp((s) => s.boot?.agents.find((a) => a.id === approval?.agentId));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  if (!approval) return null;
  const pending = approval.status === "pending";
  const statusText = {
    approved: "Approved",
    changes_requested: "Changes requested",
    cancelled: "No longer needed",
    pending: "Waiting for you",
  }[approval.status];
  return (
    <div
      data-testid="approval-card"
      data-status={approval.status}
      data-approval-id={approval.id}
      onClick={() => useApp.getState().set({ selectedApprovalId: approval.id })}
      className={cn(
        "mt-1.5 max-w-[560px] rounded-card border bg-charcoal p-4 transition-colors duration-[120ms]",
        pending ? (selected ? "border-ember/70" : "border-ember/35") : "border-hair",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", pending ? "bg-ember" : "bg-smoke")} />
        <span className="eyebrow !text-paper">
          {approval.kind === "task_review" ? "Task review" : "Permission"}
        </span>
        <span className="eyebrow">· {statusText}</span>
      </div>
      <p className="mt-1.5 text-[15px] font-medium">{approval.title}</p>
      {!compact && approval.detail.toolCall?.locations?.length ? (
        <p className="mt-0.5 font-mono text-[12px] text-ash">
          {approval.detail.toolCall.locations.join(", ")}
        </p>
      ) : null}
      {!compact && approval.detail.summary ? (
        <p className="mt-1 line-clamp-3 text-[13px] text-ash">{approval.detail.summary}</p>
      ) : null}
      {approval.kind === "permission" && agent && pending ? (
        <p className="mt-1 text-[13px] text-ash">{agent.name} is waiting for your decision.</p>
      ) : null}
      {pending ? (
        <div className="mt-3">
          {feedbackOpen ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void decide(approval.id, "changes", feedback.trim() || undefined);
              }}
            >
              <Textarea
                autoFocus
                rows={2}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                  if (e.key === "Escape") setFeedbackOpen(false);
                }}
                placeholder="What should change?"
                aria-label="Requested changes"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="light" type="submit">
                  Send
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFeedbackOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="light"
                onClick={() => void decide(approval.id, "approve")}
                data-testid="approve"
              >
                Approve <kbd className="ml-1 font-mono text-[11px] opacity-60">E</kbd>
              </Button>
              <Button
                size="sm"
                variant="dark"
                onClick={() => setFeedbackOpen(true)}
                data-testid="request-changes"
              >
                Request changes <kbd className="ml-1 font-mono text-[11px] opacity-60">R</kbd>
              </Button>
            </div>
          )}
        </div>
      ) : approval.feedback ? (
        <p className="mt-2 text-[13px] text-fog">“{approval.feedback}”</p>
      ) : null}
    </div>
  );
}

export function Attachment({ file }: { file: FileDTO }) {
  const image = file.mime.startsWith("image/");
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-[320px] items-center gap-2.5 rounded-image border border-hair bg-charcoal px-3 py-2 transition-colors duration-[120ms] hover:border-hair-strong"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="size-10 rounded-[6px] object-cover" />
      ) : (
        <FileText className="size-4 text-ash" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-paper">{file.name}</span>
        <span className="block font-mono text-[11px] text-smoke">{formatBytes(file.size)}</span>
      </span>
    </a>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  grouped,
  inThread = false,
}: {
  message: MessageDTO;
  grouped: boolean;
  inThread?: boolean;
}) {
  const openThread = useApp((s) => s.openThread);
  const openTask = useApp((s) => s.openTask);
  const set = useApp((s) => s.set);
  const isAgent = message.authorType === "agent";
  const isSystem = message.authorType === "system";
  const streaming = message.status === "streaming" && !message.id.startsWith("tmp-");
  const pendingSend = message.id.startsWith("tmp-") && message.status === "streaming";
  const failed = message.status === "error";
  const taskId = message.meta.taskId;

  if (isSystem && message.kind === "system") {
    return (
      <div className="px-5 py-1.5 pl-[60px] text-[13px] text-ash" data-testid="system-message">
        <Markdown text={message.body} />
      </div>
    );
  }

  return (
    <div
      data-testid="message"
      data-author={message.authorName}
      data-status={message.status}
      className={cn(
        "group relative flex gap-3 px-5 transition-colors duration-[120ms] hover:bg-lift",
        grouped ? "py-0.5" : "pt-3 pb-0.5",
      )}
    >
      <div className="w-7 shrink-0">
        {grouped ? null : <Avatar name={message.authorName} agent={isAgent || isSystem} />}
      </div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium">{message.authorName}</span>
            {isAgent ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.009em] text-smoke">
                agent
              </span>
            ) : null}
            <time className="text-[12px] text-smoke" dateTime={message.createdAt}>
              {timeLabel(message.createdAt)}
            </time>
          </div>
        )}
        {message.kind === "task" ? (
          <button
            type="button"
            onClick={() => taskId && openTask(taskId)}
            className="mt-0.5 inline-flex items-center gap-2 rounded-full border border-hair bg-charcoal px-3 py-1 text-[13px] hover:border-hair-strong"
          >
            <ListTodo className="size-3.5 text-ash" /> {message.body}
          </button>
        ) : message.kind === "approval" && message.meta.approvalId ? (
          <ApprovalCard approvalId={message.meta.approvalId} fallback={message.approval} />
        ) : (
          <div className={cn(pendingSend && "opacity-60", failed && "text-ash")}>
            {message.body ? (
              <Markdown text={message.body} />
            ) : streaming ? (
              <span className="text-[13px] text-ash">Working…</span>
            ) : null}
            {streaming && message.body ? (
              <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse-dot bg-paper" />
            ) : null}
          </div>
        )}
        {message.meta.tools?.length ? <ToolActivityLine tools={message.meta.tools} /> : null}
        {message.attachments.map((f) => (
          <Attachment key={f.id} file={f} />
        ))}
        {failed ? (
          <p className="mt-0.5 text-[12px] text-ember">{message.meta.error ?? "Didn't send."}</p>
        ) : null}
        {!inThread && message.replyCount > 0 ? (
          <button
            type="button"
            onClick={() => openThread(message.id)}
            className="mt-1 text-[13px] text-fog hover:text-paper"
          >
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        ) : null}
      </div>
      {!message.id.startsWith("tmp-") && message.kind === "text" ? (
        <div className="absolute -top-3 right-5 hidden items-center gap-0.5 rounded-full border border-hair bg-charcoal p-0.5 group-focus-within:flex group-hover:flex">
          {!inThread ? (
            <Tip label="Reply in thread">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Reply in thread"
                onClick={() => openThread(message.threadId ?? message.id)}
              >
                <MessageSquare />
              </Button>
            </Tip>
          ) : null}
          <Tip label="Create task">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Create task from message"
              onClick={() =>
                set({
                  newTask: {
                    open: true,
                    title: message.body.split("\n")[0]!.slice(0, 120),
                    description: message.body,
                    sourceMessageId: message.id,
                  },
                })
              }
            >
              <ListTodo />
            </Button>
          </Tip>
          {message.attachments.length ? <Paperclip className="mx-1 size-3.5 text-smoke" /> : null}
        </div>
      ) : null}
    </div>
  );
});
