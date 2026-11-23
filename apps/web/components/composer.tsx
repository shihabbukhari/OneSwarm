"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Paperclip, Plug, X } from "lucide-react";
import {
  activeTrigger,
  chipsFor,
  firstMentionedAgent,
  formatBytes,
  parseMentions,
  parseSlash,
  SLASH_COMMANDS,
  type FileDTO,
  type TaskDTO,
} from "@oneswarm/shared";
import { api } from "@/lib/api";
import { sendTyping } from "@/lib/realtime";
import { useAgents, useApp } from "@/lib/store";
import { cn, mod } from "@/lib/utils";
import { ModelChip, OptionChip } from "./model-picker";
import { Button } from "./ui/button";
import { Avatar, StatusDot } from "./ui/bits";
import { Tip } from "./ui/tooltip";

interface PickerItem {
  key: string;
  label: string;
  hint: string;
  insert: string;
  agent?: boolean;
}

export function Composer({
  channelId,
  threadId = null,
  primary = false,
}: {
  channelId: string;
  threadId?: string | null;
  primary?: boolean;
}) {
  const agents = useAgents();
  const members = useApp((s) => s.boot?.members ?? []);
  const me = useApp((s) => s.boot?.user.id);
  const limits = useApp((s) => s.boot?.limits);
  const sendMessage = useApp((s) => s.sendMessage);
  const set = useApp((s) => s.set);
  const showToast = useApp((s) => s.showToast);
  const pickerOpen = useApp((s) => s.modelPicker);
  const chosenAgentId = useApp((s) => s.composerAgent[channelId] ?? null);
  const effectiveOptions = useApp((s) => s.effectiveOptions);
  useApp((s) => s.pendingConfig);

  const [text, setText] = useState(() => {
    const s = useApp.getState().composerSeed;
    return primary && s?.channelId === channelId ? s.text : "";
  });
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState({ key: "", index: 0 });
  const [attachments, setAttachments] = useState<FileDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Suggested prompts (after onboarding, or "Ask agent…" in the palette) arrive through the store.
  useEffect(() => {
    if (!primary) return;
    const take = (seed: { channelId: string; text: string } | null) => {
      if (!seed || seed.channelId !== channelId) return;
      useApp.getState().set({ composerSeed: null });
      setText(seed.text);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(seed.text.length, seed.text.length);
      });
    };
    const initial = useApp.getState().composerSeed;
    if (initial?.channelId === channelId) {
      useApp.getState().set({ composerSeed: null });
      requestAnimationFrame(() =>
        ref.current?.setSelectionRange(initial.text.length, initial.text.length),
      );
    }
    return useApp.subscribe((s, prev) => {
      if (s.composerSeed !== prev.composerSeed) take(s.composerSeed);
    });
  }, [primary, channelId]);

  useEffect(() => {
    if (primary) ref.current?.focus();
  }, [primary, channelId]);

  // Auto-grow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  // The chip follows the first agent mentioned in the message.
  const mentioned = useMemo(() => firstMentionedAgent(text, agents), [text, agents]);
  const fallback = useMemo(
    () =>
      agents.find((a) => a.channelIds.includes(channelId) && a.status !== "offline") ??
      agents.find((a) => a.status !== "offline") ??
      agents[0],
    [agents, channelId],
  );
  const chipAgent = mentioned ?? agents.find((a) => a.id === chosenAgentId) ?? fallback;
  useEffect(() => {
    if (mentioned && mentioned.id !== chosenAgentId)
      set({ composerAgent: { ...useApp.getState().composerAgent, [channelId]: mentioned.id } });
  }, [mentioned, chosenAgentId, channelId, set]);
  const chips = chipAgent ? chipsFor(effectiveOptions(chipAgent)) : null;

  const trigger = dismissedAt === caret ? null : activeTrigger(text, caret);
  const pickerItems: PickerItem[] = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    if (trigger.kind === "slash") {
      return SLASH_COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => ({
        key: c.name,
        label: `/${c.name}`,
        hint: c.hint,
        insert: `/${c.name} `,
      }));
    }
    const agentItems = agents
      .filter((a) => a.handle.includes(q) || a.name.toLowerCase().includes(q))
      .map((a) => ({
        key: a.id,
        label: `@${a.handle}`,
        hint: `${a.name} · ${a.status}`,
        insert: `@${a.handle} `,
        agent: true,
      }));
    const people = members
      .filter((m) => m.userId !== me)
      .map((m) => ({
        m,
        handle: m.name
          .split(/\s+/)[0]!
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, ""),
      }))
      .filter(({ m, handle }) => handle.includes(q) || m.name.toLowerCase().includes(q))
      .map(({ m, handle }) => ({
        key: m.userId,
        label: `@${handle}`,
        hint: m.name,
        insert: `@${handle} `,
      }));
    return [...agentItems, ...people].slice(0, 8);
  }, [trigger, agents, members, me]);
  const triggerKey = trigger ? `${trigger.kind}:${trigger.query}:${trigger.start}` : "";
  const pickIndex =
    pick.key === triggerKey ? Math.min(pick.index, Math.max(0, pickerItems.length - 1)) : 0;
  const setPickIndex = (fn: (i: number) => number) =>
    setPick({ key: triggerKey, index: fn(pickIndex) });

  function insert(item: PickerItem) {
    if (!trigger) return;
    if (item.key === "upload") {
      setText("");
      fileRef.current?.click();
      return;
    }
    const next = text.slice(0, trigger.start) + item.insert + text.slice(caret);
    const pos = trigger.start + item.insert.length;
    setText(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files).slice(0, 10)) {
      if (limits && file.size > limits.maxFileSizeBytes) {
        showToast(
          `${file.name} is ${formatBytes(file.size)}. Files can be up to ${formatBytes(limits.maxFileSizeBytes)}.`,
        );
        continue;
      }
      const form = new FormData();
      form.append("channelId", channelId);
      form.append("file", file);
      try {
        const res = await api<{ file: FileDTO }>("/files", { form });
        setAttachments((a) => [...a, res.file]);
      } catch (err) {
        showToast((err as Error).message);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function resolveAssignee(
    handle: string,
  ): { assigneeType: "agent" | "human"; assigneeId: string } | null {
    const agent = agents.find((a) => a.handle === handle);
    if (agent) return { assigneeType: "agent", assigneeId: agent.id };
    const person = members.find((m) => m.name.split(/\s+/)[0]!.toLowerCase() === handle);
    return person ? { assigneeType: "human", assigneeId: person.userId } : null;
  }

  async function createTask(input: Record<string, unknown>) {
    try {
      const res = await api<{ task: TaskDTO }>("/tasks", { body: { channelId, ...input } });
      useApp.getState().applyEvent({ t: "task.updated", task: res.task });
      useApp.getState().openTask(res.task.id);
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  async function submit(withTask = false) {
    const body = text.trim();
    if (!body && !attachments.length) return;
    const slash = parseSlash(body);
    if (slash) {
      setText("");
      if (slash.command === "upload") {
        fileRef.current?.click();
        return;
      }
      if (slash.command === "task") {
        if (!slash.rest) return set({ newTask: { open: true } });
        await createTask({ title: slash.rest });
        return;
      }
      const [first, ...rest] = slash.rest.split(/\s+/);
      const handle = parseMentions(first ?? "")[0];
      const assignee = handle ? resolveAssignee(handle) : null;
      if (!assignee || !rest.length) {
        showToast("Use /assign @someone <task title>");
        setText(body);
        return;
      }
      await createTask({ title: rest.join(" "), ...assignee });
      return;
    }
    const sending = attachments;
    setText("");
    setAttachments([]);
    const message = await sendMessage({ channelId, body, threadId, attachments: sending });
    if (withTask && message) {
      await createTask({
        title:
          body
            .split("\n")[0]!
            .replace(/@\S+\s*/g, "")
            .slice(0, 200) || "New task",
        description: body,
        sourceMessageId: message.id,
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (pickerItems.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickIndex((i) => (i + 1) % pickerItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const item = pickerItems[pickIndex];
        // A complete slash command with arguments sends instead of completing.
        if (
          item &&
          !(trigger?.kind === "slash" && e.key === "Enter" && text.trim().includes(" "))
        ) {
          e.preventDefault();
          insert(item);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(caret);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit(true);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(false);
    }
  }

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !uploading;

  return (
    <div className="relative px-5 pb-4 pt-1">
      {pickerItems.length ? (
        <div
          role="listbox"
          aria-label={trigger?.kind === "slash" ? "Commands" : "Mentions"}
          className="absolute bottom-full left-5 z-30 mb-1 w-[320px] animate-rise rounded-card border border-hair bg-charcoal p-1 shadow-xl"
        >
          {pickerItems.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === pickIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(item);
              }}
              onMouseMove={() => setPickIndex(() => i)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left",
                i === pickIndex ? "bg-lift-2" : "",
              )}
            >
              {trigger?.kind === "mention" ? (
                <Avatar name={item.hint} agent={item.agent} className="size-5 text-[9px]" />
              ) : null}
              <span className="text-[14px] text-paper">{item.label}</span>
              <span className="truncate text-[12px] text-ash">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="rounded-card border border-hair bg-charcoal transition-colors duration-[120ms] ease-out focus-within:border-hair-strong">
        {attachments.length ? (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-void py-0.5 pl-2.5 pr-1 text-[12px] text-fog"
              >
                {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setAttachments((a) => a.filter((x) => x.id !== f.id))}
                  className="rounded-full p-0.5 hover:bg-lift-2"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          data-testid="composer"
          aria-label={threadId ? "Reply in thread" : "Message"}
          rows={1}
          value={text}
          placeholder={
            threadId
              ? "Reply…"
              : chipAgent
                ? `Message the channel, or @${chipAgent.handle} to ask an agent`
                : "Message the channel"
          }
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setDismissedAt(null);
            if (e.target.value) sendTyping(channelId, threadId);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void upload(e.clipboardData.files);
            }
          }}
          className="block max-h-[40vh] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-[1.5] text-paper outline-none placeholder:text-smoke"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {chipAgent ? (
            <>
              <ModelChip
                agent={chipAgent}
                agents={agents}
                open={primary ? pickerOpen : false}
                onOpenChange={(open) => set({ modelPicker: open })}
                onPickAgent={(id) =>
                  set({ composerAgent: { ...useApp.getState().composerAgent, [channelId]: id } })
                }
              />
              {chips?.effort ? (
                <OptionChip agent={chipAgent} option={chips.effort} testId="effort-chip" />
              ) : null}
              {chips?.mode ? (
                <OptionChip agent={chipAgent} option={chips.mode} testId="mode-chip" />
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => set({ connect: true })}
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-fog hover:bg-lift-2 hover:text-paper"
            >
              <Plug className="size-3.5" /> Connect an agent
            </button>
          )}
          <div className="flex-1" />
          {chipAgent && chipAgent.status === "offline" && mentioned ? (
            <span className="mr-2 flex items-center gap-1.5 text-[12px] text-ash">
              <StatusDot status="offline" /> {chipAgent.name} is offline
            </span>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
            data-testid="file-input"
          />
          <Tip label="Attach a file">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Attach a file"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Paperclip />
            </Button>
          </Tip>
          <Tip label={<span>Send ⏎ · Send and create task {mod()}⏎</span>}>
            <Button
              size="icon"
              variant={canSend ? "light" : "dark"}
              aria-label="Send"
              data-testid="send"
              disabled={!canSend}
              onClick={() => void submit(false)}
            >
              <ArrowUp />
            </Button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
