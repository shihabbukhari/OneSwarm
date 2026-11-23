import { platform } from "node:os";
import WebSocket from "ws";
import type { BridgeToServer, ServerToBridge } from "@oneswarm/shared";
import type { AgentHost } from "./agent-host";
import { clearConfig, type BridgeConfig } from "./config";

export const BRIDGE_VERSION = "0.1.0";

/**
 * Keeps one outbound WebSocket to the OneSwarm server, reconnecting with
 * exponential backoff. The bridge never listens on a port.
 */
export class ServerConnection {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private outbox: string[] = [];

  constructor(
    private config: BridgeConfig,
    private hosts: AgentHost[],
    private log: (line: string) => void,
    private onFatal: (reason: string) => void,
  ) {
    for (const host of hosts) host.setSender((msg) => this.send(msg));
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close(1000, "Bridge stopping");
  }

  private send(msg: BridgeToServer): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (msg.type.startsWith("run.") || msg.type === "permission.request")
      this.outbox.push(data);
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.config.wsUrl, {
      headers: { Authorization: `Bearer ${this.config.deviceToken}` },
      handshakeTimeout: 10_000,
    });
    this.ws = ws;

    ws.on("open", () => {
      this.attempt = 0;
      this.log("Connected to OneSwarm.");
      this.send({
        type: "hello",
        bridgeVersion: BRIDGE_VERSION,
        platform: platform(),
        agents: this.hosts.map((h) => h.info()),
      });
      for (const data of this.outbox.splice(0)) ws.send(data);
    });

    ws.on("message", (raw) => {
      try {
        this.dispatch(JSON.parse(String(raw)) as ServerToBridge);
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("unexpected-response", (_req, res) => {
      if (res.statusCode === 401) {
        clearConfig();
        this.closed = true;
        this.onFatal(
          "This device was revoked or its token is invalid. Get a new code from the Connect screen and run connect again.",
        );
      }
    });

    ws.on("close", (code) => {
      this.ws = null;
      if (code === 4003) {
        clearConfig();
        this.closed = true;
        this.onFatal("This device was revoked from OneSwarm.");
        return;
      }
      if (this.closed) return;
      const wait = Math.min(30_000, 1000 * 2 ** this.attempt++) * (0.75 + Math.random() * 0.5);
      this.log(`Connection lost. Reconnecting in ${Math.round(wait / 1000)}s…`);
      setTimeout(() => this.connect(), wait);
    });

    ws.on("error", (err) => {
      if (this.attempt === 0) this.log(`Can't reach ${this.config.wsUrl}: ${err.message}`);
    });
  }

  private host(key: string): AgentHost | undefined {
    return this.hosts.find((h) => h.key === key);
  }

  private dispatch(msg: ServerToBridge): void {
    switch (msg.type) {
      case "welcome":
        this.log(`Linked as “${msg.deviceName}”.`);
        return;
      case "ping":
        this.send({ type: "pong" });
        return;
      case "run.start": {
        const host = this.host(msg.agentKey);
        if (!host) {
          this.send({
            type: "run.end",
            runId: msg.runId,
            stopReason: "error",
            error: "That agent isn't on this computer any more.",
          });
          return;
        }
        host.run(msg);
        return;
      }
      case "run.cancel":
        for (const h of this.hosts) h.cancel(msg.runId);
        return;
      case "config.set":
        void this.host(msg.agentKey)?.setConfig(msg.configId, msg.value);
        return;
      case "permission.respond":
        for (const h of this.hosts) h.respondPermission(msg.permissionId, msg.optionId);
        return;
      case "revoked":
        clearConfig();
        this.closed = true;
        this.onFatal("This device was revoked from OneSwarm.");
        return;
    }
  }
}
