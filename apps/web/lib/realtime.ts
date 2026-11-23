"use client";
import type { ClientEvent, ServerEvent } from "@oneswarm/shared";
import { api } from "./api";
import { useApp } from "./store";

let socket: WebSocket | null = null;
/** Bumped on every start/stop so handlers from an old connection never act. */
let generation = 0;
let lastTyping = 0;

/** One WebSocket per tab. Reconnects with backoff and refetches state it may have missed. */
export function startRealtime(): () => void {
  const gen = ++generation;
  socket?.close();
  socket = null;
  void open(gen, 0);
  return () => {
    if (generation !== gen) return;
    generation++;
    socket?.close();
    socket = null;
  };
}

async function open(gen: number, attempt: number): Promise<void> {
  if (gen !== generation) return;
  let url: string;
  try {
    const res = await api<{ ticket: string; wsUrl: string }>("/realtime/ticket", {
      method: "POST",
    });
    url = `${res.wsUrl}?ticket=${encodeURIComponent(res.ticket)}`;
  } catch {
    return retry(gen, attempt);
  }
  if (gen !== generation) return;
  const ws = new WebSocket(url);
  socket = ws;
  let opened = false;
  ws.onopen = () => {
    if (gen !== generation) return ws.close();
    opened = true;
    useApp.getState().set({ connected: true });
    if (attempt > 0) {
      // Catch up on anything missed while disconnected.
      const s = useApp.getState();
      void s.load().catch(() => undefined);
      if (s.activeChannelId) void s.loadChannel(s.activeChannelId).catch(() => undefined);
    }
  };
  ws.onmessage = (e) => {
    if (gen !== generation) return;
    try {
      useApp.getState().applyEvent(JSON.parse(String(e.data)) as ServerEvent);
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    if (gen !== generation) return;
    if (socket === ws) socket = null;
    useApp.getState().set({ connected: false });
    retry(gen, opened ? 1 : attempt + 1);
  };
}

function retry(gen: number, attempt: number): void {
  if (gen !== generation) return;
  const wait = Math.min(15_000, 500 * 2 ** Math.max(0, attempt - 1));
  setTimeout(() => void open(gen, Math.max(1, attempt)), wait);
}

export function sendEvent(ev: ClientEvent): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(ev));
}

export function sendTyping(channelId: string, threadId: string | null): void {
  if (Date.now() - lastTyping < 2500) return;
  lastTyping = Date.now();
  sendEvent({ t: "typing", channelId, threadId });
}
