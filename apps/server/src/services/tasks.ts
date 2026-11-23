import { and, eq, sql } from "drizzle-orm";
import {
  can,
  TASK_STATUS_LABEL,
  type AuthorType,
  type TaskDTO,
  type TaskPriority,
  type TaskStatus,
} from "@oneswarm/shared";
import { badRequest, forbidden, notFound, type Actor, type AppContext } from "../context";
import {
  agents,
  approvals,
  channels,
  files,
  messages,
  taskEvents,
  tasks,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { newId } from "../security";
import type { Run } from "../bridge-hub";
import { approvalDTO, loadMessage, taskDTO, taskEventDTOs } from "./dto";
import { postSystemMessage } from "./messages";

export interface TaskInput {
  title: string;
  description?: string;
  assigneeType?: "human" | "agent" | null;
  assigneeId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  channelId?: string | null;
  sourceMessageId?: string | null;
  linkedMessageIds?: string[];
}

type TaskRow = typeof tasks.$inferSelect;
type ActorRef = { type: AuthorType; id: string | null };

async function addEvent(
  ctx: AppContext,
  task: TaskRow,
  actor: ActorRef,
  type: string,
  data: Record<string, unknown> = {},
) {
  await ctx.db.insert(taskEvents).values({
    id: newId(),
    workspaceId: task.workspaceId,
    taskId: task.id,
    actorType: actor.type,
    actorId: actor.id,
    type,
    data,
  });
  const events = await taskEventDTOs(ctx.db, task.workspaceId, task.id);
  const last = events[events.length - 1];
  if (last) ctx.hub.broadcast(task.workspaceId, { t: "task.event", event: last });
}

function broadcastTask(ctx: AppContext, task: TaskRow) {
  ctx.hub.broadcast(task.workspaceId, { t: "task.updated", task: taskDTO(task) });
}

async function validateAssignee(
  ctx: AppContext,
  workspaceId: string,
  type: "human" | "agent" | null | undefined,
  id: string | null | undefined,
) {
  if (!type || !id) return;
  if (type === "human") {
    const [m] = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, id)));
    if (!m) throw badRequest("That person isn't in this workspace.");
  } else {
    const [a] = await ctx.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, id)));
    if (!a) throw badRequest("That agent isn't in this workspace.");
  }
}

async function defaultChannelId(ctx: AppContext, workspaceId: string): Promise<string | null> {
  const [general] = await ctx.db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.workspaceId, workspaceId), eq(channels.name, "general")));
  return general?.id ?? null;
}

export async function loadTask(ctx: AppContext, workspaceId: string, id: string): Promise<TaskRow> {
  const [task] = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!task) throw notFound("Task not found.");
  return task;
}

export async function createTask(
  ctx: AppContext,
  workspaceId: string,
  actor: ActorRef,
  input: TaskInput,
): Promise<TaskDTO> {
  const title = input.title.trim();
  if (!title) throw badRequest("A task needs a title.");
  if (title.length > 200) throw badRequest("Keep the title under 200 characters.");
  await validateAssignee(ctx, workspaceId, input.assigneeType, input.assigneeId);
  let channelId = input.channelId ?? null;
  if (channelId) {
    const [c] = await ctx.db
      .select()
      .from(channels)
      .where(and(eq(channels.workspaceId, workspaceId), eq(channels.id, channelId)));
    if (!c) throw badRequest("Channel not found.");
  } else {
    channelId = await defaultChannelId(ctx, workspaceId);
  }
  const [counter] = await ctx.db
    .update(workspaces)
    .set({ taskCounter: sql`${workspaces.taskCounter} + 1` })
    .where(eq(workspaces.id, workspaceId))
    .returning({ n: workspaces.taskCounter });
  const linked = [
    ...new Set([
      ...(input.linkedMessageIds ?? []),
      ...(input.sourceMessageId ? [input.sourceMessageId] : []),
    ]),
  ];
  const [task] = await ctx.db
    .insert(tasks)
    .values({
      id: newId(),
      workspaceId,
      number: counter!.n,
      channelId,
      title,
      description: (input.description ?? "").slice(0, 20_000),
      assigneeType: input.assigneeId ? (input.assigneeType ?? null) : null,
      assigneeId: input.assigneeId ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? "none",
      dueDate: input.dueDate ?? null,
      createdBy: actor.id ?? "system",
      sourceMessageId: input.sourceMessageId ?? null,
      linkedMessageIds: linked,
    })
    .returning();
  await addEvent(ctx, task!, actor, "created", { title });
  broadcastTask(ctx, task!);
  if (task!.assigneeType === "agent" && task!.status !== "done") {
    await startTaskRun(ctx, task!, null);
  }
  return taskDTO(await loadTask(ctx, workspaceId, task!.id));
}

export async function createTaskAsHuman(
  ctx: AppContext,
  actor: Actor,
  input: TaskInput,
): Promise<TaskDTO> {
  if (!can(actor.role, "task.create")) throw forbidden();
  return createTask(ctx, actor.workspaceId, { type: "human", id: actor.userId }, input);
}

export async function updateTask(
  ctx: AppContext,
  actor: Actor,
  id: string,
  patch: Partial<TaskInput>,
): Promise<TaskDTO> {
  if (!can(actor.role, "task.update")) throw forbidden();
  const task = await loadTask(ctx, actor.workspaceId, id);
  const who: ActorRef = { type: "human", id: actor.userId };
  const changes: Partial<TaskRow> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw badRequest("A task needs a title.");
    if (title !== task.title) changes.title = title;
  }
  if (patch.description !== undefined && patch.description !== task.description)
    changes.description = patch.description.slice(0, 20_000);
  if (patch.priority !== undefined && patch.priority !== task.priority)
    changes.priority = patch.priority;
  if (patch.dueDate !== undefined && patch.dueDate !== task.dueDate)
    changes.dueDate = patch.dueDate;
  if (patch.linkedMessageIds !== undefined)
    changes.linkedMessageIds = [...new Set(patch.linkedMessageIds)];
  const assigneeChanged =
    patch.assigneeId !== undefined &&
    (patch.assigneeId !== task.assigneeId || patch.assigneeType !== task.assigneeType);
  if (assigneeChanged) {
    await validateAssignee(ctx, actor.workspaceId, patch.assigneeType, patch.assigneeId);
    changes.assigneeType = patch.assigneeId ? (patch.assigneeType ?? null) : null;
    changes.assigneeId = patch.assigneeId ?? null;
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    if (patch.status === "done" && task.status === "review" && !can(actor.role, "task.approve"))
      throw forbidden("Only members can approve tasks.");
    changes.status = patch.status;
  }
  if (Object.keys(changes).length === 0) return taskDTO(task);
  const [updated] = await ctx.db
    .update(tasks)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(tasks.workspaceId, actor.workspaceId), eq(tasks.id, id)))
    .returning();
  for (const [field, value] of Object.entries(changes)) {
    if (field === "status")
      await addEvent(ctx, updated!, who, "status", { from: task.status, to: value });
    else if (field === "assigneeId")
      await addEvent(ctx, updated!, who, "assigned", {
        assigneeType: updated!.assigneeType,
        assigneeId: value,
      });
    else if (field !== "assigneeType") await addEvent(ctx, updated!, who, "updated", { field });
  }
  if (changes.status === "done" || changes.status === "todo")
    await settleReviews(
      ctx,
      updated!,
      actor.userId,
      changes.status === "done" ? "approved" : "cancelled",
    );
  broadcastTask(ctx, updated!);
  if (
    assigneeChanged &&
    updated!.assigneeType === "agent" &&
    (updated!.status === "todo" || updated!.status === "doing")
  ) {
    await startTaskRun(ctx, updated!, null);
  }
  return taskDTO(await loadTask(ctx, actor.workspaceId, id));
}

async function settleReviews(
  ctx: AppContext,
  task: TaskRow,
  userId: string,
  status: "approved" | "cancelled",
) {
  const rows = await ctx.db
    .update(approvals)
    .set({ status, decidedBy: userId, decidedAt: new Date() })
    .where(
      and(
        eq(approvals.workspaceId, task.workspaceId),
        eq(approvals.taskId, task.id),
        eq(approvals.kind, "task_review"),
        eq(approvals.status, "pending"),
      ),
    )
    .returning();
  for (const a of rows)
    ctx.hub.broadcast(
      task.workspaceId,
      { t: "approval.updated", approval: approvalDTO(a) },
      { channelId: a.channelId },
    );
}

/** Ask the assigned agent to work on the task in the task's thread. */
export async function startTaskRun(
  ctx: AppContext,
  task: TaskRow,
  feedback: string | null,
): Promise<void> {
  if (task.assigneeType !== "agent" || !task.assigneeId) return;
  if (ctx.bridges.activeRunForTask(task.id)) return;
  const channelId = task.channelId ?? (await defaultChannelId(ctx, task.workspaceId));
  if (!channelId) return;
  const [channel] = await ctx.db.select().from(channels).where(eq(channels.id, channelId));
  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, task.workspaceId), eq(agents.id, task.assigneeId)));
  if (!channel || !agent) return;

  let threadId = task.threadId;
  if (!threadId) {
    const root = await postSystemMessage(ctx, {
      workspaceId: task.workspaceId,
      channelId,
      threadId: null,
      body: `Task OS-${task.number} · ${task.title}`,
      kind: "task",
      meta: { taskId: task.id },
    });
    threadId = root?.id ?? null;
    await ctx.db.update(tasks).set({ threadId, channelId }).where(eq(tasks.id, task.id));
  }
  if (task.status !== "doing") {
    const [doing] = await ctx.db
      .update(tasks)
      .set({ status: "doing", updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await addEvent(ctx, doing!, { type: "agent", id: agent.id }, "status", {
      from: task.status,
      to: "doing",
    });
    broadcastTask(ctx, doing!);
  } else {
    const [fresh] = await ctx.db.select().from(tasks).where(eq(tasks.id, task.id));
    broadcastTask(ctx, fresh!);
  }

  const prompt = [
    `You are ${agent.name}, working with a team in the OneSwarm channel #${channel.name}.`,
    `You were assigned Task OS-${task.number}: ${task.title}`,
    task.description ? `\nDetails:\n${task.description}` : "",
    task.dueDate ? `\nDue: ${task.dueDate}` : "",
    feedback ? `\nA reviewer requested changes:\n${feedback}` : "",
    `\nWork on the task now. When you finish, reply with a short summary of what you did. A person will review it.`,
  ]
    .filter(Boolean)
    .join("\n");
  const result = await ctx.bridges.startRun({
    workspaceId: task.workspaceId,
    agentId: agent.id,
    channelId,
    threadId,
    prompt,
    taskId: task.id,
  });
  if (!result.ok) {
    await postSystemMessage(ctx, {
      workspaceId: task.workspaceId,
      channelId,
      threadId,
      body: result.reason,
    });
    await addEvent(ctx, task, { type: "system", id: null }, "run_failed", {
      reason: result.reason,
    });
  }
}

/** When an agent finishes a task run, move the task to Review and ask a human. */
export async function onTaskRunEnd(
  ctx: AppContext,
  run: Run,
  outcome: { ok: boolean; error?: string | null },
): Promise<void> {
  if (!run.taskId) return;
  const [task] = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, run.workspaceId), eq(tasks.id, run.taskId)));
  if (!task) return;
  if (!outcome.ok) {
    await addEvent(ctx, task, { type: "agent", id: run.agentId }, "run_failed", {
      reason: outcome.error ?? "The agent stopped.",
    });
    return;
  }
  const [review] = await ctx.db
    .update(tasks)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(tasks.id, task.id))
    .returning();
  await addEvent(ctx, review!, { type: "agent", id: run.agentId }, "status", {
    from: task.status,
    to: "review",
  });
  broadcastTask(ctx, review!);

  const [reply] = await ctx.db
    .select({ body: messages.body })
    .from(messages)
    .where(eq(messages.id, run.messageId));
  const approvalId = newId();
  const messageId = newId();
  const title = `Review OS-${task.number}: ${task.title}`;
  await ctx.db.insert(messages).values({
    id: messageId,
    workspaceId: task.workspaceId,
    channelId: run.channelId,
    threadId: run.threadId,
    authorType: "system",
    authorId: null,
    body: title,
    kind: "approval",
    meta: { approvalId, taskId: task.id },
  });
  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      id: approvalId,
      workspaceId: task.workspaceId,
      channelId: run.channelId,
      threadId: run.threadId,
      messageId,
      agentId: run.agentId,
      taskId: task.id,
      kind: "task_review",
      title,
      detail: { summary: (reply?.body ?? "").slice(0, 2000) },
    })
    .returning();
  ctx.hub.broadcast(
    task.workspaceId,
    { t: "approval.updated", approval: approvalDTO(approval!) },
    { channelId: run.channelId },
  );
  const dto = await loadMessage(ctx.db, ctx.storage, task.workspaceId, messageId);
  if (dto)
    ctx.hub.broadcast(
      task.workspaceId,
      { t: "message.created", message: dto },
      { channelId: run.channelId },
    );
}

export async function taskDetail(ctx: AppContext, workspaceId: string, id: string) {
  const task = await loadTask(ctx, workspaceId, id);
  const events = await taskEventDTOs(ctx.db, workspaceId, id);
  const deliverables = await ctx.db
    .select()
    .from(files)
    .where(and(eq(files.workspaceId, workspaceId), eq(files.taskId, id)));
  return { task: taskDTO(task), events, deliverables };
}

/** Approve or request changes on a task review. */
export async function decideTaskReview(
  ctx: AppContext,
  actor: Actor,
  approval: typeof approvals.$inferSelect,
  decision: "approve" | "changes",
  feedback: string | null,
): Promise<void> {
  if (!approval.taskId) return;
  const task = await loadTask(ctx, actor.workspaceId, approval.taskId);
  const who: ActorRef = { type: "human", id: actor.userId };
  if (decision === "approve") {
    const [done] = await ctx.db
      .update(tasks)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await addEvent(ctx, done!, who, "status", { from: task.status, to: "done" });
    broadcastTask(ctx, done!);
    await postSystemMessage(ctx, {
      workspaceId: task.workspaceId,
      channelId: approval.channelId,
      threadId: approval.threadId,
      body: `${actor.name} approved OS-${task.number}. Moved to ${TASK_STATUS_LABEL.done}.`,
    });
  } else {
    await addEvent(ctx, task, who, "changes_requested", { feedback });
    const [doing] = await ctx.db
      .update(tasks)
      .set({ status: "doing", updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    await addEvent(ctx, doing!, who, "status", { from: task.status, to: "doing" });
    broadcastTask(ctx, doing!);
    await postSystemMessage(ctx, {
      workspaceId: task.workspaceId,
      channelId: approval.channelId,
      threadId: approval.threadId,
      body: `${actor.name} requested changes${feedback ? `: ${feedback}` : "."}`,
    });
    await startTaskRun(ctx, doing!, feedback);
  }
}
