import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  can,
  pickPermissionOption,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ApprovalDTO,
} from "@oneswarm/shared";
import { badRequest, forbidden, HttpError, notFound, type AppContext } from "../context";
import { approvals, messages, tasks } from "../db/schema";
import { parse, requireActor } from "../http";
import { approvalDTO, fileDTO, messageDTOs, taskDTO } from "../services/dto";
import { channelForActor } from "../services/messages";
import { createTaskAsHuman, decideTaskReview, taskDetail, updateTask } from "../services/tasks";

const taskInput = z.object({
  title: z.string().max(200),
  description: z.string().max(20_000).optional(),
  assigneeType: z.enum(["human", "agent"]).nullable().optional(),
  assigneeId: z.string().max(64).nullable().optional(),
  status: z.enum(TASK_STATUSES as [string, ...string[]]).optional(),
  priority: z.enum(TASK_PRIORITIES as [string, ...string[]]).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
    .nullable()
    .optional(),
  channelId: z.string().max(64).nullable().optional(),
  sourceMessageId: z.string().max(64).nullable().optional(),
  linkedMessageIds: z.array(z.string().max(64)).max(50).optional(),
});

export function taskRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/tasks", async (req) => {
    const actor = await requireActor(ctx, req);
    const rows = await ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, actor.workspaceId))
      .orderBy(asc(tasks.number));
    return { tasks: rows.map(taskDTO) };
  });

  app.post("/api/tasks", async (req) => {
    const actor = await requireActor(ctx, req);
    const input = parse(taskInput, req.body);
    if (input.channelId) await channelForActor(ctx, actor, input.channelId);
    return {
      task: await createTaskAsHuman(ctx, actor, input as Parameters<typeof createTaskAsHuman>[2]),
    };
  });

  app.get("/api/tasks/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const detail = await taskDetail(ctx, actor.workspaceId, id);
    const linked = detail.task.linkedMessageIds.length
      ? await ctx.db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.workspaceId, actor.workspaceId),
              inArray(messages.id, detail.task.linkedMessageIds),
            ),
          )
      : [];
    return {
      task: detail.task,
      events: detail.events,
      deliverables: await Promise.all(detail.deliverables.map((f) => fileDTO(ctx.storage, f))),
      linkedMessages: await messageDTOs(ctx.db, ctx.storage, actor.workspaceId, linked),
    };
  });

  app.patch("/api/tasks/:id", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    const input = parse(taskInput.partial(), req.body);
    return { task: await updateTask(ctx, actor, id, input as Parameters<typeof updateTask>[3]) };
  });

  app.post("/api/approvals/:id/decide", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "approval.decide")) throw forbidden("Guests can't approve agent actions.");
    const { id } = req.params as { id: string };
    const input = parse(
      z.object({
        decision: z.enum(["approve", "changes"]),
        feedback: z.string().max(4000).optional(),
      }),
      req.body,
    );
    const [approval] = await ctx.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.workspaceId, actor.workspaceId), eq(approvals.id, id)));
    if (!approval) throw notFound("Approval not found.");
    await channelForActor(ctx, actor, approval.channelId);
    if (approval.status !== "pending")
      throw new HttpError(409, "This was already decided.", "decided");

    if (approval.kind === "permission") {
      const options = ((approval.detail as ApprovalDTO["detail"]).options ?? []) as Array<{
        optionId: string;
        kind: string;
      }>;
      const optionId = pickPermissionOption(options, input.decision);
      if (input.decision === "approve" && !optionId)
        throw badRequest("The agent didn't offer an allow option.");
      const delivered = approval.permissionId
        ? ctx.bridges.respondPermission(approval.permissionId, optionId)
        : false;
      if (!delivered) {
        const [cancelled] = await ctx.db
          .update(approvals)
          .set({ status: "cancelled", decidedAt: new Date() })
          .where(eq(approvals.id, id))
          .returning();
        ctx.hub.broadcast(
          actor.workspaceId,
          { t: "approval.updated", approval: approvalDTO(cancelled!) },
          { channelId: approval.channelId },
        );
        throw new HttpError(
          409,
          "The agent is no longer waiting for this. It may have stopped or gone offline.",
          "gone",
        );
      }
    }
    const [updated] = await ctx.db
      .update(approvals)
      .set({
        status: input.decision === "approve" ? "approved" : "changes_requested",
        feedback: input.feedback ?? null,
        decidedBy: actor.userId,
        decidedAt: new Date(),
      })
      .where(eq(approvals.id, id))
      .returning();
    ctx.hub.broadcast(
      actor.workspaceId,
      { t: "approval.updated", approval: approvalDTO(updated!) },
      { channelId: approval.channelId },
    );
    if (approval.kind === "task_review")
      await decideTaskReview(ctx, actor, approval, input.decision, input.feedback ?? null);
    return { approval: approvalDTO(updated!) };
  });
}
