import type { WebSocket } from "ws";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  bridgeToServerSchema,
  mapSessionUpdate,
  mergeToolActivity,
  toHandle,
  valuesOf,
  type AgentDTO,
  type BridgeAgentInfo,
  type ConfigOption,
  type ServerToBridge,
  type ToolActivity,
} from "@oneswarm/shared";
import type { AppContext } from "./context";
import {
  agents,
  agentSessions,
  approvals,
  bridgeDevices,
  channelMembers,
  channels,
  messages,
} from "./db/schema";
import { env } from "./env";
import { newId, signToken } from "./security";
import {
  agentDTOs,
  agentMessagesLastHour,
  approvalDTO,
  deviceDTO,
  loadMessage,
} from "./services/dto";

interface DeviceConn {
  ws: WebSocket;
  deviceId: string;
  workspaceId: string;
  /** agent key -> agent id for agents the bridge reported in its last hello. */
  agents: Map<string, string>;
  alive: boolean;
}

export interface Run {
  runId: string;
  workspaceId: string;
  agentId: string;
  deviceId: string;
  channelId: string;
  threadId: string | null;
  sessionRowId: string;
  messageId: string;
  taskId: string | null;
  text: string;
  tools: ToolActivity[];
  flushTimer: NodeJS.Timeout | null;
  toolTimer: NodeJS.Timeout | null;
}

export interface StartRunInput {
  workspaceId: string;
  agentId: string;
  channelId: string;
  /** Thread root id; null means the channel's main timeline. Also where the reply is posted. */
  threadId: string | null;
  prompt: string;
  taskId?: string | null;
}

type RunEndHandler = (
  run: Run,
  outcome: { ok: boolean; stopReason: string; error?: string | null },
) => Promise<void>;

/** Keeps one WebSocket per bridge device and drives agent runs over it. */
export class BridgeHub {
  private ctx!: AppContext;
  private devices = new Map<string, DeviceConn>();
  private runs = new Map<string, Run>();
  private permissions = new Map<string, { runId: string; deviceId: string }>();
  private runEndHandlers: RunEndHandler[] = [];
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const conn of this.devices.values()) {
        if (!conn.alive) {
          conn.ws.terminate();
          continue;
        }
        conn.alive = false;
        this.send(conn, { type: "ping" });
      }
    }, 25_000);
    this.heartbeat.unref();
  }

  bind(ctx: AppContext): void {
    this.ctx = ctx;
  }

  onRunEnd(handler: RunEndHandler): void {
    this.runEndHandlers.push(handler);
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const conn of this.devices.values()) conn.ws.close(1001, "Server shutting down");
  }

  /* ----------------------------- status ----------------------------- */

  isDeviceConnected(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  statusOf = (agentId: string, deviceId: string): AgentDTO["status"] => {
    const conn = this.devices.get(deviceId);
    if (!conn || ![...conn.agents.values()].includes(agentId)) return "offline";
    for (const run of this.runs.values()) if (run.agentId === agentId) return "working";
    return "online";
  };

  async agentDTO(workspaceId: string, agentId: string): Promise<AgentDTO | null> {
    const [dto] = await agentDTOs(this.ctx.db, workspaceId, this.statusOf, [agentId]);
    return dto ?? null;
  }

  private async broadcastAgent(workspaceId: string, agentId: string): Promise<void> {
    const dto = await this.agentDTO(workspaceId, agentId);
    if (dto) this.ctx.hub.broadcast(workspaceId, { t: "agent.updated", agent: dto });
  }

  private async broadcastDevice(deviceId: string): Promise<void> {
    const [row] = await this.ctx.db
      .select()
      .from(bridgeDevices)
      .where(eq(bridgeDevices.id, deviceId));
    if (row) {
      this.ctx.hub.broadcast(
        row.workspaceId,
        { t: "device.updated", device: deviceDTO(row, this.isDeviceConnected(row.id)) },
        { staffOnly: true },
      );
    }
  }

  /* --------------------------- connection --------------------------- */

  attach(ws: WebSocket, device: typeof bridgeDevices.$inferSelect): void {
    const previous = this.devices.get(device.id);
    if (previous) previous.ws.close(4000, "Replaced by a newer connection");
    const conn: DeviceConn = {
      ws,
      deviceId: device.id,
      workspaceId: device.workspaceId,
      agents: new Map(),
      alive: true,
    };
    this.devices.set(device.id, conn);
    this.send(conn, {
      type: "welcome",
      workspaceId: device.workspaceId,
      deviceId: device.id,
      deviceName: device.name,
    });
    void this.touchDevice(device.id).then(() => this.broadcastDevice(device.id));

    let budget = 200;
    const refill = setInterval(() => (budget = 200), 1000);
    ws.on("message", (raw) => {
      conn.alive = true;
      // Streaming tokens are chatty; still cap a misbehaving bridge.
      if (--budget < 0) {
        ws.close(4008, "Too many messages");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const msg = bridgeToServerSchema.safeParse(parsed);
      if (!msg.success) return;
      void this.handle(conn, msg.data).catch((err) =>
        console.error("[bridge] handler failed", err),
      );
    });
    ws.on("pong", () => (conn.alive = true));
    ws.on("close", () => {
      clearInterval(refill);
      if (this.devices.get(device.id) === conn) {
        this.devices.delete(device.id);
        void this.onDisconnect(conn);
      }
    });
  }

  private send(conn: DeviceConn, msg: ServerToBridge): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private async touchDevice(deviceId: string): Promise<void> {
    await this.ctx.db
      .update(bridgeDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(bridgeDevices.id, deviceId));
  }

  private async onDisconnect(conn: DeviceConn): Promise<void> {
    for (const run of [...this.runs.values()]) {
      if (run.deviceId === conn.deviceId)
        await this.finishRun(run, {
          ok: false,
          stopReason: "error",
          error: "The bridge disconnected.",
        });
    }
    await this.touchDevice(conn.deviceId);
    for (const agentId of conn.agents.values())
      await this.broadcastAgent(conn.workspaceId, agentId);
    await this.broadcastDevice(conn.deviceId);
  }

  /** Close a revoked device's socket right away. */
  revoke(deviceId: string): void {
    const conn = this.devices.get(deviceId);
    if (!conn) return;
    this.send(conn, { type: "revoked" });
    conn.ws.close(4003, "Device revoked");
  }

  /* ----------------------------- messages ---------------------------- */

  private async handle(
    conn: DeviceConn,
    msg: ReturnType<typeof bridgeToServerSchema.parse>,
  ): Promise<void> {
    switch (msg.type) {
      case "pong":
        return;
      case "hello": {
        const seen = new Map<string, string>();
        for (const info of msg.agents) {
          const id = await this.upsertAgent(conn, info as BridgeAgentInfo);
          seen.set(info.key, id);
        }
        const before = conn.agents;
        conn.agents = seen;
        await this.touchDevice(conn.deviceId);
        for (const id of new Set([...before.values(), ...seen.values()]))
          await this.broadcastAgent(conn.workspaceId, id);
        return;
      }
      case "agent.status": {
        const id = await this.upsertAgent(conn, msg.agent as BridgeAgentInfo);
        conn.agents.set(msg.agent.key, id);
        await this.broadcastAgent(conn.workspaceId, id);
        return;
      }
      case "agent.config": {
        const agentId = conn.agents.get(msg.key);
        if (!agentId) return;
        await this.ctx.db
          .update(agents)
          .set({ configOptions: msg.configOptions as ConfigOption[] })
          .where(and(eq(agents.id, agentId), eq(agents.workspaceId, conn.workspaceId)));
        await this.broadcastAgent(conn.workspaceId, agentId);
        return;
      }
      case "config.error": {
        this.ctx.hub.broadcast(conn.workspaceId, { t: "limit", message: msg.message });
        const agentId = conn.agents.get(msg.key);
        if (agentId) await this.broadcastAgent(conn.workspaceId, agentId);
        return;
      }
      case "run.session": {
        const run = this.runs.get(msg.runId);
        if (!run || run.deviceId !== conn.deviceId) return;
        await this.ctx.db
          .update(agentSessions)
          .set({ acpSessionId: msg.acpSessionId, updatedAt: new Date() })
          .where(eq(agentSessions.id, run.sessionRowId));
        return;
      }
      case "run.update": {
        const run = this.runs.get(msg.runId);
        if (!run || run.deviceId !== conn.deviceId) return;
        const event = mapSessionUpdate(msg.update);
        if (event.type === "text" && event.text) {
          run.text += event.text;
          this.ctx.hub.broadcast(
            run.workspaceId,
            {
              t: "message.delta",
              id: run.messageId,
              channelId: run.channelId,
              threadId: run.threadId,
              delta: event.text,
            },
            { channelId: run.channelId },
          );
          this.scheduleFlush(run);
        } else if (event.type === "tool" && event.tool.id) {
          run.tools = mergeToolActivity(run.tools, event.tool);
          this.scheduleToolBroadcast(run);
        } else if (event.type === "config") {
          await this.ctx.db
            .update(agents)
            .set({ configOptions: event.configOptions })
            .where(and(eq(agents.id, run.agentId), eq(agents.workspaceId, run.workspaceId)));
          await this.broadcastAgent(run.workspaceId, run.agentId);
        }
        return;
      }
      case "run.end": {
        const run = this.runs.get(msg.runId);
        if (!run || run.deviceId !== conn.deviceId) return;
        const ok = msg.stopReason !== "error" && !msg.error;
        await this.finishRun(run, { ok, stopReason: msg.stopReason, error: msg.error });
        return;
      }
      case "permission.request": {
        const run = this.runs.get(msg.runId);
        if (!run || run.deviceId !== conn.deviceId) return;
        await this.createPermissionApproval(run, msg);
        return;
      }
    }
  }

  private async upsertAgent(conn: DeviceConn, info: BridgeAgentInfo): Promise<string> {
    const { db } = this.ctx;
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.deviceId, conn.deviceId), eq(agents.key, info.key)));
    const fields = {
      version: info.version ?? null,
      loggedIn: info.loggedIn,
      loginCommand: info.loginCommand ?? null,
      error: info.error ?? null,
      lastSeenAt: new Date(),
      ...(info.configOptions ? { configOptions: info.configOptions } : {}),
    };
    if (existing) {
      await db.update(agents).set(fields).where(eq(agents.id, existing.id));
      return existing.id;
    }
    const taken = new Set(
      (
        await db
          .select({ handle: agents.handle })
          .from(agents)
          .where(eq(agents.workspaceId, conn.workspaceId))
      ).map((r) => r.handle),
    );
    const base = toHandle(info.name);
    let handle = base;
    for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`;
    const id = newId();
    await db.insert(agents).values({
      id,
      workspaceId: conn.workspaceId,
      deviceId: conn.deviceId,
      key: info.key,
      handle,
      name: info.name,
      ...fields,
    });
    // New agents start in #general; members can add them to other channels.
    const [general] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.workspaceId, conn.workspaceId), eq(channels.name, "general")));
    if (general) {
      await db
        .insert(channelMembers)
        .values({
          channelId: general.id,
          workspaceId: conn.workspaceId,
          memberType: "agent",
          memberId: id,
        })
        .onConflictDoNothing();
    }
    return id;
  }

  /* ------------------------------- runs ------------------------------ */

  async startRun(
    input: StartRunInput,
  ): Promise<{ ok: true; runId: string } | { ok: false; reason: string }> {
    const { db, hub, storage } = this.ctx;
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.workspaceId, input.workspaceId)));
    if (!agent) return { ok: false, reason: "That agent no longer exists." };
    const conn = this.devices.get(agent.deviceId);
    if (!conn || !conn.agents.has(agent.key)) {
      return {
        ok: false,
        reason: `${agent.name} is offline. Start the bridge on the computer it runs on.`,
      };
    }
    if (!agent.loggedIn) {
      return {
        ok: false,
        reason: `${agent.name} isn't logged in on its computer. Run \`${agent.loginCommand ?? "its login command"}\` there, then try again.`,
      };
    }
    const used = await agentMessagesLastHour(db, input.workspaceId);
    if (used >= env.limits.agentMessagesPerHour) {
      return {
        ok: false,
        reason: `Agents in this workspace have sent ${env.limits.agentMessagesPerHour} messages in the last hour, the fair-use limit. Try again in a little while.`,
      };
    }

    // One ACP session per channel thread (the main timeline counts as a thread).
    const [sessionRow] = await db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.workspaceId, input.workspaceId),
          eq(agentSessions.agentId, agent.id),
          eq(agentSessions.channelId, input.channelId),
          input.threadId
            ? eq(agentSessions.threadId, input.threadId)
            : isNull(agentSessions.threadId),
        ),
      );
    const sessionRowId = sessionRow?.id ?? newId();
    if (!sessionRow) {
      await db.insert(agentSessions).values({
        id: sessionRowId,
        workspaceId: input.workspaceId,
        agentId: agent.id,
        channelId: input.channelId,
        threadId: input.threadId,
      });
    }

    const runId = newId();
    const messageId = newId();
    await db.insert(messages).values({
      id: messageId,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      threadId: input.threadId,
      authorType: "agent",
      authorId: agent.id,
      body: "",
      status: "streaming",
      meta: { runId, tools: [], ...(input.taskId ? { taskId: input.taskId } : {}) },
    });
    const run: Run = {
      runId,
      workspaceId: input.workspaceId,
      agentId: agent.id,
      deviceId: agent.deviceId,
      channelId: input.channelId,
      threadId: input.threadId,
      sessionRowId,
      messageId,
      taskId: input.taskId ?? null,
      text: "",
      tools: [],
      flushTimer: null,
      toolTimer: null,
    };
    this.runs.set(runId, run);
    const dto = await loadMessage(db, storage, input.workspaceId, messageId);
    if (dto)
      hub.broadcast(
        input.workspaceId,
        { t: "message.created", message: dto },
        { channelId: input.channelId },
      );
    hub.broadcast(
      input.workspaceId,
      {
        t: "agent.working",
        agentId: agent.id,
        channelId: input.channelId,
        threadId: input.threadId,
        working: true,
      },
      { channelId: input.channelId },
    );
    await this.broadcastAgent(input.workspaceId, agent.id);

    const sessionKey = `${input.channelId}:${input.threadId ?? "main"}`;
    this.send(conn, {
      type: "run.start",
      runId,
      agentKey: agent.key,
      sessionKey,
      acpSessionId: sessionRow?.acpSessionId ?? null,
      prompt: input.prompt,
      config: valuesOf(agent.configOptions),
      files: {
        serverUrl: env.publicServerUrl,
        token: signToken(
          { k: "agent", ws: input.workspaceId, agent: agent.id, ch: input.channelId },
          6 * 60 * 60,
        ),
      },
    });
    return { ok: true, runId };
  }

  private scheduleFlush(run: Run): void {
    if (run.flushTimer) return;
    run.flushTimer = setTimeout(() => {
      run.flushTimer = null;
      void this.ctx.db
        .update(messages)
        .set({ body: run.text, updatedAt: new Date() })
        .where(eq(messages.id, run.messageId))
        .catch(() => undefined);
    }, 750);
  }

  private scheduleToolBroadcast(run: Run): void {
    if (run.toolTimer) return;
    run.toolTimer = setTimeout(() => {
      run.toolTimer = null;
      void (async () => {
        const [row] = await this.ctx.db
          .select({ meta: messages.meta })
          .from(messages)
          .where(eq(messages.id, run.messageId));
        await this.ctx.db
          .update(messages)
          .set({
            body: run.text,
            meta: { ...(row?.meta ?? {}), tools: run.tools },
            updatedAt: new Date(),
          })
          .where(eq(messages.id, run.messageId));
        const dto = await loadMessage(
          this.ctx.db,
          this.ctx.storage,
          run.workspaceId,
          run.messageId,
        );
        if (dto)
          this.ctx.hub.broadcast(
            run.workspaceId,
            { t: "message.updated", message: dto },
            { channelId: run.channelId },
          );
      })().catch(() => undefined);
    }, 100);
  }

  private async finishRun(
    run: Run,
    outcome: { ok: boolean; stopReason: string; error?: string | null },
  ): Promise<void> {
    if (!this.runs.has(run.runId)) return;
    this.runs.delete(run.runId);
    if (run.flushTimer) clearTimeout(run.flushTimer);
    if (run.toolTimer) clearTimeout(run.toolTimer);
    const { db, hub, storage } = this.ctx;
    const [row] = await db
      .select({ meta: messages.meta })
      .from(messages)
      .where(eq(messages.id, run.messageId));
    const body = run.text || (outcome.ok ? "" : "");
    await db
      .update(messages)
      .set({
        body,
        status: outcome.ok ? "complete" : "error",
        meta: {
          ...(row?.meta ?? {}),
          tools: run.tools,
          stopReason: outcome.stopReason,
          ...(outcome.error ? { error: outcome.error } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(messages.id, run.messageId));
    // Any permission still waiting on this run can no longer be answered.
    const pending = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.runId, run.runId), eq(approvals.status, "pending")));
    if (pending.length) {
      await db
        .update(approvals)
        .set({ status: "cancelled", decidedAt: new Date() })
        .where(
          inArray(
            approvals.id,
            pending.map((p) => p.id),
          ),
        );
      for (const p of pending) {
        hub.broadcast(
          run.workspaceId,
          { t: "approval.updated", approval: approvalDTO({ ...p, status: "cancelled" }) },
          { channelId: run.channelId },
        );
      }
    }
    for (const [pid, p] of this.permissions)
      if (p.runId === run.runId) this.permissions.delete(pid);
    const dto = await loadMessage(db, storage, run.workspaceId, run.messageId);
    if (dto)
      hub.broadcast(
        run.workspaceId,
        { t: "message.updated", message: dto },
        { channelId: run.channelId },
      );
    hub.broadcast(
      run.workspaceId,
      {
        t: "agent.working",
        agentId: run.agentId,
        channelId: run.channelId,
        threadId: run.threadId,
        working: false,
      },
      { channelId: run.channelId },
    );
    await this.broadcastAgent(run.workspaceId, run.agentId);
    for (const handler of this.runEndHandlers) {
      await handler(run, outcome).catch((err) =>
        console.error("[bridge] run end handler failed", err),
      );
    }
  }

  cancelRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const conn = this.devices.get(run.deviceId);
    if (conn) this.send(conn, { type: "run.cancel", runId });
  }

  activeRunForTask(taskId: string): Run | undefined {
    for (const run of this.runs.values()) if (run.taskId === taskId) return run;
    return undefined;
  }

  /* ---------------------------- permissions --------------------------- */

  private async createPermissionApproval(
    run: Run,
    msg: Extract<ReturnType<typeof bridgeToServerSchema.parse>, { type: "permission.request" }>,
  ): Promise<void> {
    const { db, hub, storage } = this.ctx;
    const tool = mapSessionUpdate({ ...msg.toolCall, sessionUpdate: "tool_call_update" });
    const toolCall = tool.type === "tool" ? tool.tool : { id: msg.toolCall.toolCallId };
    const title = toolCall.title ?? "The agent wants to use a tool";
    const approvalId = newId();
    const messageId = newId();
    this.permissions.set(msg.permissionId, { runId: run.runId, deviceId: run.deviceId });
    await db.insert(messages).values({
      id: messageId,
      workspaceId: run.workspaceId,
      channelId: run.channelId,
      threadId: run.threadId,
      authorType: "agent",
      authorId: run.agentId,
      body: title,
      kind: "approval",
      meta: { approvalId, runId: run.runId, ...(run.taskId ? { taskId: run.taskId } : {}) },
    });
    const [approval] = await db
      .insert(approvals)
      .values({
        id: approvalId,
        workspaceId: run.workspaceId,
        channelId: run.channelId,
        threadId: run.threadId,
        messageId,
        agentId: run.agentId,
        runId: run.runId,
        permissionId: msg.permissionId,
        taskId: run.taskId,
        kind: "permission",
        title,
        detail: { toolCall, options: msg.options },
      })
      .returning();
    hub.broadcast(
      run.workspaceId,
      { t: "approval.updated", approval: approvalDTO(approval!) },
      { channelId: run.channelId },
    );
    const dto = await loadMessage(db, storage, run.workspaceId, messageId);
    if (dto)
      hub.broadcast(
        run.workspaceId,
        { t: "message.created", message: dto },
        { channelId: run.channelId },
      );
  }

  /** Send a permission decision to the agent. Returns false if the run is gone. */
  respondPermission(permissionId: string, optionId: string | null): boolean {
    const p = this.permissions.get(permissionId);
    if (!p) return false;
    const conn = this.devices.get(p.deviceId);
    if (!conn) return false;
    this.permissions.delete(permissionId);
    this.send(conn, { type: "permission.respond", permissionId, optionId });
    return true;
  }

  /* ------------------------------ config ----------------------------- */

  setConfig(agent: typeof agents.$inferSelect, configId: string, value: string | boolean): boolean {
    const conn = this.devices.get(agent.deviceId);
    if (!conn || !conn.agents.has(agent.key)) return false;
    this.send(conn, { type: "config.set", agentKey: agent.key, configId, value });
    return true;
  }
}
