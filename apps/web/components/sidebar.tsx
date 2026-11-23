"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Hash, Plus, Search, Settings } from "lucide-react";
import { useAgents, useApp } from "@/lib/store";
import { cn, mod } from "@/lib/utils";
import { Kbd, StatusDot } from "./ui/bits";
import { Tip } from "./ui/tooltip";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex h-6 items-center justify-between px-3">
        <span className="eyebrow">{title}</span>
        {action}
      </div>
      <div className="mt-0.5 space-y-px">{children}</div>
    </div>
  );
}

const itemClass =
  "flex h-7 items-center gap-2 rounded-[8px] px-3 text-[14px] text-fog transition-colors duration-[120ms] ease-out hover:bg-lift-2 hover:text-paper";

export function Sidebar() {
  const boot = useApp((s) => s.boot);
  const agents = useAgents();
  const set = useApp((s) => s.set);
  const openRight = useApp((s) => s.setRight);
  const pathname = usePathname();
  const filter = useSearchParams().get("filter");
  if (!boot) return null;
  const myId = boot.user.id;
  const counts = {
    mine: boot.tasks.filter(
      (t) => t.assigneeType === "human" && t.assigneeId === myId && t.status !== "done",
    ).length,
    review: boot.tasks.filter((t) => t.status === "review").length,
    all: boot.tasks.filter((t) => t.status !== "done").length,
  };
  const channels = boot.channels.filter((c) => c.isMember || boot.role !== "guest");

  return (
    <nav aria-label="Workspace" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-4">
        <span className="truncate text-[15px] font-medium" data-testid="workspace-name">
          {boot.workspace.name}
        </span>
      </div>
      <div className="px-2">
        <button
          type="button"
          onClick={() => set({ palette: true })}
          className="flex h-8 w-full items-center gap-2 rounded-full border border-hair bg-void px-3 text-[13px] text-smoke hover:border-hair-strong hover:text-fog"
        >
          <Search className="size-3.5" /> Search
          <span className="ml-auto flex gap-0.5">
            <Kbd>{mod()}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Section
          title="Channels"
          action={
            boot.role !== "guest" ? (
              <Tip label="New channel">
                <button
                  type="button"
                  aria-label="New channel"
                  onClick={() => set({ newChannel: true })}
                  className="rounded-full p-0.5 text-ash hover:text-paper"
                >
                  <Plus className="size-3.5" />
                </button>
              </Tip>
            ) : null
          }
        >
          {channels.map((c) => {
            const active = pathname === `/c/${c.name}`;
            return (
              <Link
                key={c.id}
                href={`/c/${c.name}`}
                data-testid={`channel-${c.name}`}
                className={cn(
                  itemClass,
                  active && "bg-lift-2 text-paper",
                  c.unread > 0 && !active && "text-paper",
                )}
              >
                <Hash className="size-3.5 text-smoke" />
                <span className={cn("truncate", c.unread > 0 && !active && "font-medium")}>
                  {c.name}
                </span>
                {c.unread > 0 && !active ? (
                  <span
                    data-testid={`unread-${c.name}`}
                    className="ml-auto min-w-[18px] rounded-full bg-paper px-1.5 text-center font-mono text-[11px] leading-[18px] text-obsidian"
                  >
                    {c.unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </Section>
        <Section
          title="Agents"
          action={
            boot.role !== "guest" ? (
              <Tip label="Connect a bridge">
                <button
                  type="button"
                  aria-label="Connect agents"
                  onClick={() => set({ connect: true })}
                  className="rounded-full p-0.5 text-ash hover:text-paper"
                >
                  <Plus className="size-3.5" />
                </button>
              </Tip>
            ) : null
          }
        >
          {agents.length === 0 ? (
            <p className="px-3 py-1 text-[13px] text-smoke">No agents yet.</p>
          ) : null}
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              data-testid={`agent-${a.handle}`}
              data-status={a.status}
              onClick={() => openRight({ open: true, tab: "agents" })}
              className={cn(itemClass, "w-full")}
            >
              <StatusDot status={a.status} />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto font-mono text-[10px] uppercase text-smoke">
                {a.status === "offline" && a.loginCommand ? "login" : a.status}
              </span>
            </button>
          ))}
        </Section>
        <Section title="Tasks">
          {(["mine", "review", "all"] as const).map((f) => (
            <Link
              key={f}
              href={`/tasks?filter=${f}`}
              className={cn(
                itemClass,
                pathname === "/tasks" && (filter ?? "all") === f && "bg-lift-2 text-paper",
              )}
            >
              <span>{f === "mine" ? "Mine" : f === "review" ? "Review" : "All"}</span>
              {counts[f] ? (
                <span className="ml-auto font-mono text-[11px] text-smoke">{counts[f]}</span>
              ) : null}
            </Link>
          ))}
        </Section>
      </div>
      <div className="border-t border-hair p-2">
        <Link
          href="/settings/profile"
          className={cn(itemClass, pathname.startsWith("/settings") && "bg-lift-2 text-paper")}
        >
          <Settings className="size-3.5" /> Settings
        </Link>
      </div>
    </nav>
  );
}
