"use client";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskDTO, type TaskStatus } from "@oneswarm/shared";
import { useAgents, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { EmptyState, StatusDot } from "./ui/bits";

const PRIORITY_MARK: Record<TaskDTO["priority"], string> = {
  none: "",
  low: "Low",
  medium: "Med",
  high: "High",
  urgent: "Urgent",
};

/** Compact list grouped by status, like Linear. Details open in the right panel. */
export function TasksView({ filter }: { filter: "mine" | "review" | "all" }) {
  const boot = useApp((s) => s.boot);
  const agents = useAgents();
  const openTask = useApp((s) => s.openTask);
  const selected = useApp((s) =>
    s.right.open && s.right.tab === "details" ? s.right.taskId : null,
  );
  const set = useApp((s) => s.set);
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskStatus, boolean>>>({
    done: filter !== "all",
  });
  if (!boot) return null;
  const tasks = boot.tasks.filter((t) =>
    filter === "mine"
      ? t.assigneeType === "human" && t.assigneeId === boot.user.id
      : filter === "review"
        ? t.status === "review"
        : true,
  );
  const assigneeName = (t: TaskDTO) =>
    t.assigneeType === "agent"
      ? agents.find((a) => a.id === t.assigneeId)?.name
      : boot.members.find((m) => m.userId === t.assigneeId)?.name;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col" aria-label="Tasks">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hair px-5">
        <h1 className="text-[15px] font-medium">Tasks</h1>
        <span className="eyebrow">
          {filter === "mine" ? "Assigned to me" : filter === "review" ? "In review" : "All"}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="light"
          onClick={() => set({ newTask: { open: true } })}
          data-testid="new-task"
        >
          <Plus /> New task
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="task-list">
        {tasks.length === 0 ? (
          <EmptyState
            eyebrow="Tasks"
            title={filter === "review" ? "Nothing to review" : "No tasks yet"}
            body="Create one here, with /task in any channel, or from a message's hover menu."
          >
            <Button variant="light" onClick={() => set({ newTask: { open: true } })}>
              New task
            </Button>
          </EmptyState>
        ) : (
          TASK_STATUSES.map((status) => {
            const group = tasks.filter((t) => t.status === status);
            if (!group.length) return null;
            return (
              <div key={status} data-testid={`task-group-${status}`}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
                  aria-expanded={!collapsed[status]}
                  className="flex h-9 w-full items-center gap-2 bg-charcoal/60 px-5 text-left"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-ash transition-transform duration-[120ms]",
                      !collapsed[status] && "rotate-90",
                    )}
                  />
                  <span className="text-[13px] font-medium">{TASK_STATUS_LABEL[status]}</span>
                  <span className="font-mono text-[11px] text-smoke">{group.length}</span>
                </button>
                {collapsed[status]
                  ? null
                  : group.map((t) => {
                      const agent =
                        t.assigneeType === "agent"
                          ? agents.find((a) => a.id === t.assigneeId)
                          : undefined;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-testid="task-row"
                          data-task-title={t.title}
                          onClick={() => openTask(t.id)}
                          className={cn(
                            "flex h-10 w-full items-center gap-3 px-5 text-left text-[14px] transition-colors duration-[120ms] hover:bg-lift",
                            selected === t.id && "bg-lift-2",
                          )}
                        >
                          <span className="w-14 shrink-0 font-mono text-[12px] text-smoke">
                            OS-{t.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          {PRIORITY_MARK[t.priority] ? (
                            <span className="font-mono text-[11px] uppercase text-ash">
                              {PRIORITY_MARK[t.priority]}
                            </span>
                          ) : null}
                          {t.dueDate ? (
                            <span className="text-[12px] text-ash">{t.dueDate}</span>
                          ) : null}
                          <span className="flex w-32 shrink-0 items-center justify-end gap-1.5 truncate text-[13px] text-fog">
                            {agent ? <StatusDot status={agent.status} /> : null}
                            {assigneeName(t) ?? <span className="text-smoke">Unassigned</span>}
                          </span>
                        </button>
                      );
                    })}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
