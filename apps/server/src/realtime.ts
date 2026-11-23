import type { WebSocket } from "ws";
import { clientEventSchema, type Role, type ServerEvent } from "@oneswarm/shared";
import { randomToken } from "./security";

interface Conn {
  ws: WebSocket;
  userId: string;
  name: string;
  workspaceId: string;
  role: Role;
  /** Channels a guest belongs to; owners and members see every channel. */
  guestChannels: Set<string>;
  tokens: number;
  lastRefill: number;
}

interface Ticket {
  userId: string;
  name: string;
  workspaceId: string;
  role: Role;
  guestChannels: string[];
  expires: number;
}

/** Messages per second each browser connection may send, with a small burst. */
const RATE = 10;
const BURST = 30;

/** Fans server events out to the browsers of one workspace. */
export class RealtimeHub {
  private conns = new Map<string, Set<Conn>>();
  private tickets = new Map<string, Ticket>();

  issueTicket(t: Omit<Ticket, "expires">): string {
    const token = randomToken("wst_", 24);
    this.tickets.set(token, { ...t, expires: Date.now() + 60_000 });
    for (const [key, value] of this.tickets)
      if (value.expires < Date.now()) this.tickets.delete(key);
    return token;
  }

  /** Tickets are single use and expire after a minute. */
  redeemTicket(token: string): Ticket | null {
    const t = this.tickets.get(token);
    this.tickets.delete(token);
    if (!t || t.expires < Date.now()) return null;
    return t;
  }

  attach(ws: WebSocket, ticket: Ticket): void {
    const conn: Conn = {
      ws,
      userId: ticket.userId,
      name: ticket.name,
      workspaceId: ticket.workspaceId,
      role: ticket.role,
      guestChannels: new Set(ticket.guestChannels),
      tokens: BURST,
      lastRefill: Date.now(),
    };
    let set = this.conns.get(conn.workspaceId);
    if (!set) {
      set = new Set();
      this.conns.set(conn.workspaceId, set);
    }
    set.add(conn);
    this.send(conn, { t: "hello", userId: conn.userId });

    ws.on("message", (raw) => {
      if (!this.allow(conn)) {
        ws.close(4008, "Too many messages");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const event = clientEventSchema.safeParse(parsed);
      if (!event.success) return;
      if (event.data.t === "ping") this.send(conn, { t: "pong" });
      if (event.data.t === "typing") {
        if (!this.canSee(conn, event.data.channelId)) return;
        this.broadcast(
          conn.workspaceId,
          {
            t: "typing",
            channelId: event.data.channelId,
            threadId: event.data.threadId ?? null,
            userId: conn.userId,
            name: conn.name,
          },
          { channelId: event.data.channelId, exceptUserId: conn.userId },
        );
      }
    });
    ws.on("close", () => {
      set?.delete(conn);
    });
  }

  private allow(conn: Conn): boolean {
    const now = Date.now();
    conn.tokens = Math.min(BURST, conn.tokens + ((now - conn.lastRefill) / 1000) * RATE);
    conn.lastRefill = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  private canSee(conn: Conn, channelId: string): boolean {
    return conn.role !== "guest" || conn.guestChannels.has(channelId);
  }

  private send(conn: Conn, event: ServerEvent): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(event));
  }

  /** Broadcast to a workspace. Channel-scoped events skip guests outside the channel. */
  broadcast(
    workspaceId: string,
    event: ServerEvent,
    opts: {
      channelId?: string | null;
      exceptUserId?: string;
      onlyUserId?: string;
      staffOnly?: boolean;
    } = {},
  ): void {
    const set = this.conns.get(workspaceId);
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const conn of set) {
      if (opts.exceptUserId && conn.userId === opts.exceptUserId) continue;
      if (opts.onlyUserId && conn.userId !== opts.onlyUserId) continue;
      if (opts.staffOnly && conn.role === "guest") continue;
      if (opts.channelId && !this.canSee(conn, opts.channelId)) continue;
      if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(payload);
    }
  }

  /** Keep a guest's channel list current after they are added to or removed from a channel. */
  setGuestChannel(workspaceId: string, userId: string, channelId: string, member: boolean): void {
    for (const conn of this.conns.get(workspaceId) ?? []) {
      if (conn.userId !== userId) continue;
      if (member) conn.guestChannels.add(channelId);
      else conn.guestChannels.delete(channelId);
    }
  }

  disconnectUser(workspaceId: string, userId: string): void {
    for (const conn of this.conns.get(workspaceId) ?? []) {
      if (conn.userId === userId) conn.ws.close(4001, "Removed from workspace");
    }
  }
}
