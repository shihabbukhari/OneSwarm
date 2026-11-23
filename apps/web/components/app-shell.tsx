"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { startRealtime } from "@/lib/realtime";
import { useApp } from "@/lib/store";
import { cn, isTypingTarget } from "@/lib/utils";
import {
  CommandPalette,
  ConnectDialog,
  InviteDialog,
  NewChannelDialog,
  NewTaskDialog,
  ShortcutsDialog,
} from "./dialogs";
import { RightPanel } from "./right-panel";
import { Sidebar } from "./sidebar";
import { Skeleton } from "./ui/bits";
import { TooltipProvider } from "./ui/tooltip";

/** Loads the workspace, opens the realtime connection, and redirects when signed out. */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const boot = useApp((s) => s.boot);
  const load = useApp((s) => s.load);
  useEffect(() => {
    load().catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
      else if (err instanceof ApiError && err.code === "no_workspace")
        router.replace("/onboarding");
    });
    return startRealtime();
  }, [load, router]);
  if (!boot) return <ShellSkeleton />;
  return <TooltipProvider delayDuration={400}>{children}</TooltipProvider>;
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh bg-onyx" aria-busy="true" aria-label="Loading workspace">
      <div className="w-[220px] space-y-3 border-r border-hair p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-full rounded-full" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-3 w-3/4" />
        ))}
      </div>
      <div className="flex-1" />
    </div>
  );
}

const LEFT = { min: 180, max: 360, def: 220 };
const RIGHT = { min: 280, max: 520, def: 320 };

function usePanelSizes(userId: string) {
  const key = `oneswarm:panels:${userId}`;
  const [saved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") as {
        left?: number;
        right?: number;
        leftCollapsed?: boolean;
      } | null;
    } catch {
      return null;
    }
  });
  const [sizes, setSizes] = useState({
    left: saved?.left ?? LEFT.def,
    right: saved?.right ?? RIGHT.def,
  });
  useEffect(() => {
    if (saved?.leftCollapsed !== undefined)
      useApp.getState().set({ leftCollapsed: saved.leftCollapsed });
  }, [saved]);
  const leftCollapsed = useApp((s) => s.leftCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ...sizes, leftCollapsed }));
    } catch {
      // storage may be unavailable
    }
  }, [key, sizes, leftCollapsed]);
  return [sizes, setSizes] as const;
}

function ResizeHandle({
  side,
  onResize,
}: {
  side: "left" | "right";
  onResize: (dx: number) => void;
}) {
  const start = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(side === "left" ? -16 : 16);
        if (e.key === "ArrowRight") onResize(side === "left" ? 16 : -16);
      }}
      onPointerDown={(e) => {
        start.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const dx = e.clientX - start.current;
        start.current = e.clientX;
        onResize(side === "left" ? dx : -dx);
      }}
      onPointerUp={() => (start.current = null)}
      className="group relative z-10 w-0 cursor-col-resize outline-none"
    >
      <span className="absolute inset-y-0 -left-1 w-2 transition-colors duration-[120ms] group-hover:bg-white/10 group-focus-visible:bg-white/20" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const boot = useApp((s) => s.boot)!;
  const leftCollapsed = useApp((s) => s.leftCollapsed);
  const rightOpen = useApp((s) => s.right.open);
  const connected = useApp((s) => s.connected);
  const toast = useApp((s) => s.toast);
  const [sizes, setSizes] = usePanelSizes(boot.user.id);
  const router = useRouter();
  const pathname = usePathname();

  const switchChannel = useCallback(
    (dir: 1 | -1) => {
      const s = useApp.getState();
      const list = (s.boot?.channels ?? []).filter((c) => c.isMember || s.boot?.role !== "guest");
      if (!list.length) return;
      const current = list.findIndex((c) => pathname === `/c/${c.name}`);
      const next = list[(current + dir + list.length) % list.length];
      if (next) router.push(`/c/${next.name}`);
    },
    [pathname, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = useApp.getState();
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === "k") {
        e.preventDefault();
        s.set({ palette: !s.palette });
      } else if (meta && e.key === "/") {
        e.preventDefault();
        s.set({ modelPicker: !s.modelPicker });
      } else if (meta && key === "b") {
        e.preventDefault();
        s.toggleLeft();
      } else if (meta && key === "i") {
        e.preventDefault();
        s.toggleRight();
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        switchChannel(e.key === "ArrowUp" ? -1 : 1);
      } else if (
        !meta &&
        !e.altKey &&
        !isTypingTarget(e.target) &&
        !document.querySelector("[role=dialog]")
      ) {
        if (e.key === "?") {
          e.preventDefault();
          s.set({ shortcuts: true });
        } else if (key === "e" || key === "r") {
          const approvals = s.boot?.approvals ?? [];
          const target =
            approvals.find((a) => a.id === s.selectedApprovalId) ??
            approvals.find((a) => a.channelId === s.activeChannelId) ??
            approvals[0];
          if (!target) return;
          e.preventDefault();
          if (key === "e") void s.decide(target.id, "approve");
          else
            document
              .querySelector<HTMLButtonElement>(
                `[data-approval-id="${target.id}"] [data-testid="request-changes"]`,
              )
              ?.click();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchChannel]);

  const clamp = (v: number, r: { min: number; max: number }) => Math.max(r.min, Math.min(r.max, v));

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-onyx">
      <div
        className={cn(
          "shrink-0 overflow-hidden border-r border-hair bg-onyx transition-[width] duration-[120ms] ease-out",
          leftCollapsed && "border-r-0",
        )}
        style={{ width: leftCollapsed ? 0 : sizes.left }}
        data-testid="left-panel"
        aria-hidden={leftCollapsed}
      >
        <div style={{ width: sizes.left }} className="h-full">
          <Sidebar />
        </div>
      </div>
      {!leftCollapsed ? (
        <ResizeHandle
          side="left"
          onResize={(dx) => setSizes((s) => ({ ...s, left: clamp(s.left + dx, LEFT) }))}
        />
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col">
        {!connected ? (
          <div
            className="flex h-6 shrink-0 items-center justify-center bg-charcoal text-[12px] text-ash"
            role="status"
          >
            Reconnecting…
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">{children}</div>
      </main>
      {rightOpen ? (
        <ResizeHandle
          side="right"
          onResize={(dx) => setSizes((s) => ({ ...s, right: clamp(s.right + dx, RIGHT) }))}
        />
      ) : null}
      <div
        className={cn(
          "shrink-0 overflow-hidden bg-onyx transition-[width] duration-[120ms] ease-out",
          rightOpen && "border-l border-hair",
        )}
        style={{ width: rightOpen ? sizes.right : 0 }}
        aria-hidden={!rightOpen}
      >
        <div style={{ width: sizes.right }} className="h-full">
          {rightOpen ? <RightPanel /> : null}
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
      <NewTaskDialog />
      <NewChannelDialog />
      <InviteDialog />
      <ConnectDialog />
      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 max-w-[520px] -translate-x-1/2 animate-rise rounded-full border border-hair bg-graphite px-4 py-2 text-[13px] text-paper shadow-xl"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
