"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Hash, PanelRight, Users } from "lucide-react";
import type { MessageDTO } from "@oneswarm/shared";
import { useAgents, useApp } from "@/lib/store";
import { cn, dayLabel } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageItem } from "./message";
import { Button } from "./ui/button";
import { EmptyState, Skeleton } from "./ui/bits";
import { Tip } from "./ui/tooltip";

const EMPTY: MessageDTO[] = [];

function grouped(prev: MessageDTO | undefined, m: MessageDTO): boolean {
  if (!prev || prev.authorId !== m.authorId || prev.authorType !== m.authorType) return false;
  if (m.kind !== "text" || prev.kind !== "text") return false;
  return new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
}

export function MessageList({
  messages,
  loading,
  inThread = false,
}: {
  messages: MessageDTO[];
  loading?: boolean;
  inThread?: boolean;
}) {
  const days = messages.map((m) => dayLabel(m.createdAt));
  return (
    <div className="pb-2" role="log" aria-live="polite" aria-relevant="additions">
      {loading ? (
        <div className="space-y-5 px-5 py-4" aria-label="Loading messages">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className={cn("h-3", i % 2 ? "w-2/3" : "w-1/2")} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {messages.map((m, i) => {
        const day = days[i]!;
        const divider = !inThread && (i === 0 || day !== days[i - 1]);
        return (
          <div key={m.clientId && m.id.startsWith("tmp-") ? m.clientId : m.id}>
            {divider ? (
              <div className="flex items-center gap-3 px-5 pt-5 pb-1">
                <span className="eyebrow">{day}</span>
                <span className="h-px flex-1 bg-hair" />
              </div>
            ) : null}
            <MessageItem
              message={m}
              grouped={!divider && grouped(messages[i - 1], m)}
              inThread={inThread}
            />
          </div>
        );
      })}
    </div>
  );
}

function TypingLine({ channelId, threadId }: { channelId: string; threadId: string | null }) {
  const typing = useApp((s) => s.typing[channelId]);
  const agents = useAgents();
  const messages = useApp((s) => (threadId ? s.threads[threadId] : s.messages[channelId]) ?? EMPTY);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const people = (typing ?? [])
    .filter((t) => t.threadId === threadId && now - t.at < 4000)
    .map((t) => t.name);
  const working = [
    ...new Set(
      messages
        .filter((m) => m.authorType === "agent" && m.status === "streaming")
        .map((m) => m.authorId),
    ),
  ]
    .map((id) => agents.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];
  const text = [
    working.length ? `${working.join(", ")} ${working.length === 1 ? "is" : "are"} working…` : "",
    people.length ? `${people.join(", ")} ${people.length === 1 ? "is" : "are"} typing…` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <div className="h-5 px-6 text-[12px] text-ash" aria-live="polite" data-testid="typing-line">
      {text ? (
        <span className="inline-flex items-center gap-1.5">
          {working.length ? (
            <span className="size-1.5 animate-pulse-dot rounded-full bg-ember" />
          ) : null}
          {text}
        </span>
      ) : null}
    </div>
  );
}

export function ChannelView({ channelId }: { channelId: string }) {
  const channel = useApp((s) => s.boot?.channels.find((c) => c.id === channelId));
  const messages = useApp((s) => s.messages[channelId] ?? EMPTY);
  const loaded = useApp((s) => channelId in s.messages);
  const hasMore = useApp((s) => s.hasMore[channelId]);
  const loadChannel = useApp((s) => s.loadChannel);
  const setActive = useApp((s) => s.setActiveChannel);
  const toggleRight = useApp((s) => s.toggleRight);
  const setRight = useApp((s) => s.setRight);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setActive(channelId);
    stick.current = true;
    void loadChannel(channelId).catch(() => undefined);
    return () => setActive(null);
  }, [channelId, setActive, loadChannel]);

  // Stay pinned to the bottom while new messages and tokens stream in.
  const last = messages[messages.length - 1];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.body, last?.status]);

  if (!channel)
    return (
      <EmptyState
        eyebrow="Channel"
        title="Not found"
        body="This channel doesn't exist or you don't have access."
      />
    );

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col" aria-label={`#${channel.name}`}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hair px-5">
        <h1 className="flex items-center gap-1 text-[15px] font-medium">
          <Hash className="size-4 text-ash" />
          {channel.name}
        </h1>
        {channel.topic ? (
          <p className="min-w-0 truncate text-[13px] text-ash">{channel.topic}</p>
        ) : null}
        <div className="flex-1" />
        <Tip label="Members">
          <button
            type="button"
            onClick={() => setRight({ open: true, tab: "agents" })}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] text-ash hover:text-paper"
          >
            <Users className="size-3.5" /> {channel.memberCount}
          </button>
        </Tip>
        <Tip label="Toggle details (⌘I)">
          <Button size="icon" variant="ghost" aria-label="Toggle right panel" onClick={toggleRight}>
            <PanelRight />
          </Button>
        </Tip>
      </header>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 40 && hasMore) void loadChannel(channelId, true);
        }}
      >
        {loaded && messages.length === 0 ? (
          <EmptyState
            eyebrow={`#${channel.name}`}
            title="A quiet beginning"
            body="Say hello, or @mention an agent to put it to work."
          />
        ) : (
          <MessageList messages={messages} loading={!loaded} />
        )}
      </div>
      <TypingLine channelId={channelId} threadId={null} />
      <Composer channelId={channelId} primary />
    </section>
  );
}
