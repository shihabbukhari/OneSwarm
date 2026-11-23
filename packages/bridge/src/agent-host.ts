import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
  BridgeAgentInfo,
  BridgeToServer,
  ConfigOption,
  ServerToBridge,
} from "@oneswarm/shared";
import type { DetectedAgent } from "./registry";

const { client, methods } = acp;

type RunStart = Extract<ServerToBridge, { type: "run.start" }>;
type Send = (msg: BridgeToServer) => void;

interface PendingPermission {
  resolve: (outcome: acp.RequestPermissionResponse) => void;
}

function isAuthError(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === -32000 || /auth/i.test(e?.message ?? "");
}

function errorText(err: unknown): string {
  const e = err as { message?: string; data?: unknown };
  return (e?.message ?? String(err)).slice(0, 500);
}

/**
 * One agent process speaking ACP over stdio. The process inherits the
 * person's environment, so it uses its own existing login.
 */
export class AgentHost {
  readonly key: string;
  readonly name: string;
  private child: ChildProcess | null = null;
  private conn: acp.ClientConnection | null = null;
  private version: string | null = null;
  private loggedIn = false;
  private error: string | null = null;
  /** A session opened at start-up to read and change config options. */
  private configSession: string | null = null;
  private configOptions: ConfigOption[] | null = null;
  /** sessionKey (channel:thread) -> ACP session id */
  private sessions = new Map<string, string>();
  /** ACP session id -> active run id */
  private activeRuns = new Map<string, string>();
  private queues = new Map<string, Promise<void>>();
  private permissions = new Map<string, PendingPermission>();
  private restarts = 0;
  private stopped = false;
  private send: Send = () => undefined;

  constructor(
    private detected: DetectedAgent,
    private opts: {
      cwd: string;
      selfCommand: { command: string; args: string[] };
      log: (line: string) => void;
    },
  ) {
    this.key = detected.spec.key;
    this.name = detected.spec.name;
  }

  setSender(send: Send): void {
    this.send = send;
  }

  info(): BridgeAgentInfo {
    return {
      key: this.key,
      name: this.name,
      version: this.version,
      loggedIn: this.loggedIn,
      loginCommand: this.loggedIn ? null : this.detected.spec.loginCommand,
      error: this.error,
      configOptions: this.configOptions,
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    const child = spawn(this.detected.command, this.detected.args, {
      cwd: this.opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.child = child;
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean))
        this.opts.log(`[${this.key}] ${line}`);
    });
    child.on("exit", (code) => this.onExit(code));
    child.on("error", (err) => {
      this.error = `Could not start ${this.name}: ${err.message}`;
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const app = client({ name: "oneswarm-bridge" })
      .onNotification(methods.client.session.update, ({ params }) => this.onUpdate(params))
      .onRequest(methods.client.session.requestPermission, ({ params }) =>
        this.onPermission(params),
      );
    this.conn = app.connect(stream);
    const agent = this.conn.agent;

    try {
      const init = await agent.request(methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          session: { configOptions: { boolean: {} } },
        } as acp.ClientCapabilities,
        clientInfo: { name: "oneswarm-bridge", title: "OneSwarm bridge", version: "0.1.0" },
      });
      this.version = (init as { agentInfo?: { version?: string } }).agentInfo?.version ?? null;
    } catch (err) {
      this.error = `${this.name} did not start its ACP server: ${errorText(err)}`;
      this.loggedIn = false;
      return;
    }
    await this.openConfigSession();
  }

  private async openConfigSession(): Promise<void> {
    if (!this.conn) return;
    try {
      const res = await this.conn.agent.request(methods.agent.session.new, {
        cwd: this.opts.cwd,
        mcpServers: [],
      });
      this.configSession = res.sessionId;
      this.configOptions = (res.configOptions as ConfigOption[] | null | undefined) ?? null;
      this.loggedIn = true;
      this.error = null;
    } catch (err) {
      this.loggedIn = false;
      this.configOptions = null;
      this.error = isAuthError(err) ? null : errorText(err);
    }
  }

  /** Re-check the login (e.g. after the person runs the login command). */
  async refresh(): Promise<void> {
    if (!this.loggedIn) await this.openConfigSession();
    this.send({ type: "agent.status", agent: this.info() });
  }

  private onExit(code: number | null): void {
    this.conn = null;
    this.configSession = null;
    this.sessions.clear();
    for (const [, runId] of this.activeRuns) {
      this.send({
        type: "run.end",
        runId,
        stopReason: "error",
        error: `${this.name} exited (code ${code ?? "?"}).`,
      });
    }
    this.activeRuns.clear();
    for (const p of this.permissions.values()) p.resolve({ outcome: { outcome: "cancelled" } });
    this.permissions.clear();
    if (this.stopped) return;
    this.loggedIn = false;
    this.error = `${this.name} stopped unexpectedly.`;
    this.send({ type: "agent.status", agent: this.info() });
    if (this.restarts < 5) {
      const wait = 1000 * 2 ** this.restarts++;
      setTimeout(() => {
        void this.start().then(() => this.send({ type: "agent.status", agent: this.info() }));
      }, wait).unref();
    }
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
  }

  /* ------------------------------ ACP in ------------------------------ */

  private onUpdate(params: acp.SessionNotification): void {
    const update = params.update as unknown as {
      sessionUpdate: string;
      configOptions?: ConfigOption[];
    };
    if (update.sessionUpdate === "config_option_update" && Array.isArray(update.configOptions)) {
      this.configOptions = update.configOptions;
      this.send({ type: "agent.config", key: this.key, configOptions: update.configOptions });
      return;
    }
    const runId = this.activeRuns.get(params.sessionId);
    if (!runId) return;
    this.send({ type: "run.update", runId, update: update as { sessionUpdate: string } });
  }

  private onPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const runId = this.activeRuns.get(params.sessionId);
    if (!runId) return Promise.resolve({ outcome: { outcome: "cancelled" } });
    const permissionId = randomUUID();
    return new Promise((resolve) => {
      this.permissions.set(permissionId, { resolve });
      this.send({
        type: "permission.request",
        runId,
        permissionId,
        toolCall: params.toolCall as { toolCallId: string },
        options: params.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
      });
    });
  }

  /* ---------------------------- server in ----------------------------- */

  respondPermission(permissionId: string, optionId: string | null): void {
    const pending = this.permissions.get(permissionId);
    if (!pending) return;
    this.permissions.delete(permissionId);
    pending.resolve(
      optionId
        ? { outcome: { outcome: "selected", optionId } }
        : { outcome: { outcome: "cancelled" } },
    );
  }

  async setConfig(configId: string, value: string | boolean): Promise<void> {
    if (!this.conn || !this.configSession) {
      this.send({
        type: "config.error",
        key: this.key,
        message: `${this.name} isn't ready to change settings.`,
      });
      return;
    }
    try {
      const res = await this.conn.agent.request(methods.agent.session.setConfigOption, {
        sessionId: this.configSession,
        configId,
        value,
        ...(typeof value === "boolean" ? { type: "boolean" } : {}),
      } as acp.SetSessionConfigOptionRequest);
      this.configOptions = res.configOptions as ConfigOption[];
      this.send({ type: "agent.config", key: this.key, configOptions: this.configOptions });
      // Apply to open thread sessions too, so the next reply uses the new setting.
      for (const sessionId of this.sessions.values()) {
        void this.conn.agent
          .request(methods.agent.session.setConfigOption, {
            sessionId,
            configId,
            value,
          } as acp.SetSessionConfigOptionRequest)
          .catch(() => undefined);
      }
    } catch (err) {
      this.send({
        type: "config.error",
        key: this.key,
        message: `${this.name} rejected that setting: ${errorText(err)}`,
      });
    }
  }

  cancel(runId: string): void {
    for (const [sessionId, active] of this.activeRuns) {
      if (active === runId && this.conn)
        void this.conn.agent.notify(methods.agent.session.cancel, { sessionId });
    }
  }

  /** Prompts in one thread run one after another. */
  run(msg: RunStart): void {
    const prev = this.queues.get(msg.sessionKey) ?? Promise.resolve();
    const next = prev.then(() => this.execute(msg)).catch(() => undefined);
    this.queues.set(msg.sessionKey, next);
  }

  private mcpServers(msg: RunStart): acp.McpServer[] {
    if (!msg.files) return [];
    return [
      {
        name: "oneswarm-files",
        command: this.opts.selfCommand.command,
        args: [...this.opts.selfCommand.args, "mcp-files"],
        env: [
          { name: "ONESWARM_SERVER", value: msg.files.serverUrl },
          { name: "ONESWARM_AGENT_TOKEN", value: msg.files.token },
        ],
      } as acp.McpServer,
    ];
  }

  private async execute(msg: RunStart): Promise<void> {
    if (!this.conn) {
      this.send({
        type: "run.end",
        runId: msg.runId,
        stopReason: "error",
        error: `${this.name} isn't running.`,
      });
      return;
    }
    const agent = this.conn.agent;
    let sessionId = this.sessions.get(msg.sessionKey);
    try {
      if (!sessionId) {
        const res = await agent.request(methods.agent.session.new, {
          cwd: this.opts.cwd,
          mcpServers: this.mcpServers(msg),
        });
        sessionId = res.sessionId;
        this.sessions.set(msg.sessionKey, sessionId);
        this.send({ type: "run.session", runId: msg.runId, acpSessionId: sessionId });
        // Replay the chosen model, effort and mode on the new session.
        const current = new Map(
          ((res.configOptions as ConfigOption[] | null | undefined) ?? []).map((o) => [o.id, o]),
        );
        const order = Object.keys(msg.config).sort((a, b) =>
          current.get(a)?.category === "model" ? -1 : current.get(b)?.category === "model" ? 1 : 0,
        );
        for (const configId of order) {
          const want = msg.config[configId];
          const have = current.get(configId);
          if (have && want !== undefined && have.currentValue !== want) {
            await agent
              .request(methods.agent.session.setConfigOption, {
                sessionId,
                configId,
                value: want,
              } as acp.SetSessionConfigOptionRequest)
              .catch(() => undefined);
          }
        }
      }
      this.activeRuns.set(sessionId, msg.runId);
      const res = await agent.request(methods.agent.session.prompt, {
        sessionId,
        prompt: [{ type: "text", text: msg.prompt }],
      });
      this.send({ type: "run.end", runId: msg.runId, stopReason: res.stopReason });
    } catch (err) {
      if (isAuthError(err)) {
        this.loggedIn = false;
        this.send({ type: "agent.status", agent: this.info() });
      }
      this.send({ type: "run.end", runId: msg.runId, stopReason: "error", error: errorText(err) });
    } finally {
      if (sessionId && this.activeRuns.get(sessionId) === msg.runId)
        this.activeRuns.delete(sessionId);
    }
  }
}
