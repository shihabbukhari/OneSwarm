import * as React from "react";
import type { AgentStatus } from "@oneswarm/shared";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-chip bg-lift-2", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hair px-1 font-mono text-[11px] text-ash",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

const DOT: Record<AgentStatus, string> = {
  online: "bg-paper",
  working: "bg-ember animate-pulse-dot",
  offline: "border border-smoke bg-transparent",
};

export function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span
      aria-label={status}
      title={status}
      className={cn("inline-block size-[7px] shrink-0 rounded-full", DOT[status], className)}
    />
  );
}

/** Glass badge pill with a dot, e.g. "● 2 WAITING". */
export function GlassBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-hair bg-glass px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.009em] text-paper",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  agent,
  className,
}: {
  name: string;
  agent?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center text-[11px] font-medium",
        agent
          ? "rounded-[8px] border border-hair-strong bg-graphite font-mono text-paper"
          : "rounded-full bg-charcoal text-fog",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

export function EmptyState({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="display mt-2 text-[40px] leading-[1.2]">{title}</h2>
      {body ? <p className="mt-3 text-[14px] text-ash">{body}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
