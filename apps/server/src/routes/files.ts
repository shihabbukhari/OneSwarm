import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { can, formatBytes, mimeForFileName } from "@oneswarm/shared";
import { badRequest, forbidden, limitHit, notFound, type AppContext } from "../context";
import { files, tasks } from "../db/schema";
import { env } from "../env";
import { requireActor } from "../http";
import { newId, verifyDownload } from "../security";
import { fileDTO, storageUsed } from "../services/dto";
import { channelForActor } from "../services/messages";

/** Very small magic-number check so a renamed binary can't pass as text or an image. */
function looksLike(mime: string, head: Buffer): boolean {
  const hex = head.subarray(0, 8).toString("hex");
  switch (mime) {
    case "image/png":
      return hex.startsWith("89504e47");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/gif":
      return hex.startsWith("47494638");
    case "image/webp":
      return (
        head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP"
      );
    case "application/pdf":
      return head.subarray(0, 5).toString() === "%PDF-";
    case "application/zip":
      return hex.startsWith("504b0304") || hex.startsWith("504b0506");
    default:
      // Text formats: reject NUL bytes in the first 8 KB.
      return !head.subarray(0, 8192).includes(0);
  }
}

export function fileRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/files", async (req) => {
    const actor = await requireActor(ctx, req);
    if (!can(actor.role, "file.upload")) throw forbidden();
    const part = await req.file({ limits: { fileSize: env.limits.maxFileSizeBytes, files: 1 } });
    if (!part) throw badRequest("Choose a file to upload.");
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const channelId =
      typeof fields.channelId?.value === "string" && fields.channelId.value
        ? fields.channelId.value
        : null;
    const taskId =
      typeof fields.taskId?.value === "string" && fields.taskId.value ? fields.taskId.value : null;
    if (channelId) await channelForActor(ctx, actor, channelId);
    if (taskId) {
      const [t] = await ctx.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, actor.workspaceId), eq(tasks.id, taskId)));
      if (!t) throw notFound("Task not found.");
    }
    const name = part.filename.replace(/[/\\\0]/g, "_").slice(0, 200) || "file";
    const mime = mimeForFileName(name);
    if (!mime)
      throw badRequest(
        "That file type isn't supported. Try an image, PDF, text, code, CSV, JSON or zip file.",
      );
    const body = await part.toBuffer();
    if (part.file.truncated) {
      throw limitHit(
        `Files can be up to ${formatBytes(env.limits.maxFileSizeBytes)}. This one is bigger.`,
      );
    }
    if (!looksLike(mime, body)) throw badRequest("The file's contents don't match its type.");
    const used = await storageUsed(ctx.db, actor.workspaceId);
    if (used + body.length > env.limits.workspaceStorageBytes) {
      throw limitHit(
        `This workspace has used its ${formatBytes(env.limits.workspaceStorageBytes)} of storage. Delete old files to make room.`,
      );
    }
    const id = newId();
    const storageKey = `${actor.workspaceId}/${id}`;
    await ctx.storage.put(storageKey, body, mime);
    const [row] = await ctx.db
      .insert(files)
      .values({
        id,
        workspaceId: actor.workspaceId,
        channelId,
        taskId,
        uploadedByType: "human",
        uploadedById: actor.userId,
        name,
        mime,
        size: body.length,
        storageKey,
      })
      .returning();
    const dto = await fileDTO(ctx.storage, row!);
    ctx.hub.broadcast(actor.workspaceId, { t: "file.created", file: dto }, { channelId });
    return { file: dto };
  });

  app.get("/api/channels/:id/files", async (req) => {
    const actor = await requireActor(ctx, req);
    const { id } = req.params as { id: string };
    await channelForActor(ctx, actor, id);
    const rows = await ctx.db
      .select()
      .from(files)
      .where(and(eq(files.workspaceId, actor.workspaceId), eq(files.channelId, id)))
      .orderBy(desc(files.createdAt))
      .limit(200);
    return { files: await Promise.all(rows.map((f) => fileDTO(ctx.storage, f))) };
  });

  /** Signed download for the local-disk driver. R2 downloads go straight to the bucket. */
  app.get("/api/files/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    if (!sig || !verifyDownload(id, Number(exp), sig))
      throw forbidden("This download link has expired. Reopen the file.");
    const [row] = await ctx.db.select().from(files).where(eq(files.id, id));
    if (!row) throw notFound("File not found.");
    const stream = await ctx.storage.stream(row.storageKey);
    const inline = row.mime.startsWith("image/") && row.mime !== "image/svg+xml";
    return reply
      .header("content-type", row.mime)
      .header("content-length", String(row.size))
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; img-src 'self'; sandbox")
      .header("cache-control", "private, max-age=900")
      .header(
        "content-disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      )
      .send(stream);
  });
}
