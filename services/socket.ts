import { getWsBaseUrl } from "./config";
import { fetchWsTicket } from "./api";
import type { InboundWireMessage, WireMessage } from "@/types";
import type { OutboundCallSignal } from "@/types/call";

type StatusHandler = (connected: boolean) => void;
type AuthFailHandler = () => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const CONNECT_TIMEOUT_MS = 10_000;

let ws: WebSocket | null = null;
let onStatus: StatusHandler | null = null;
let onAuthFail: AuthFailHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let consecutiveFailures = 0;
let shouldReconnect = false;
let intentionalClose = false;
let isConnecting = false;

// Type-keyed dispatch table — registered by chatStore, callStore, etc.
const _handlers = new Map<string, (data: unknown) => void>();

function readyStateLabel(state?: number | null): string {
  if (state === WebSocket.CONNECTING) return "CONNECTING";
  if (state === WebSocket.OPEN) return "OPEN";
  if (state === WebSocket.CLOSING) return "CLOSING";
  if (state === WebSocket.CLOSED) return "CLOSED";
  return "NO_SOCKET";
}

function clearConnectTimeout() {
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }
}

function scheduleReconnect() {
  if (intentionalClose || !shouldReconnect) return;

  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    onAuthFail?.();
    return;
  }

  const delay = Math.min(
    RECONNECT_BASE_MS * 2 ** reconnectAttempt,
    RECONNECT_MAX_MS
  );
  if (__DEV__) console.warn("[WS] scheduling reconnect", { reconnectAttempt, consecutiveFailures, delayMs: delay });
  reconnectTimer = setTimeout(() => {
    reconnectAttempt++;
    if (__DEV__) console.log("[WS] reconnect attempt", { reconnectAttempt });
    doConnect();
  }, delay);
}

async function doConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (__DEV__) console.log("[WS] connect skipped - socket already active");
    return;
  }
  if (isConnecting) {
    if (__DEV__) console.log("[WS] connect skipped - ticket fetch already in flight");
    return;
  }
  isConnecting = true;

  let ticket: string;
  try {
    ticket = await fetchWsTicket();
  } catch (err) {
    console.error("[WS] failed to fetch ticket", err);
    isConnecting = false;
    consecutiveFailures++;
    scheduleReconnect();
    return;
  }
  isConnecting = false;

  intentionalClose = false;

  const url = `${getWsBaseUrl()}/ws/chat?ticket=${encodeURIComponent(ticket)}`;
  ws = new WebSocket(url);
  if (__DEV__) console.log("[WS] socket created");

  // Fail fast if the connection doesn't open within CONNECT_TIMEOUT_MS
  connectTimeoutTimer = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      if (__DEV__) console.warn("[WS] connection timed out — closing");
      ws.close();
    }
  }, CONNECT_TIMEOUT_MS);

  ws.onopen = () => {
    clearConnectTimeout();
    reconnectAttempt = 0;
    consecutiveFailures = 0;
    if (__DEV__) console.log("[WS] open");
    onStatus?.(true);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;

      if ("error" in data) {
        console.warn("[WS] server error:", data.error);
        return;
      }

      const type = data.type as string | undefined;

      if (type === "status") {
        if (__DEV__) console.log("[WS] delivery status", { to: data.to, delivered: data.delivered });
        return;
      }

      if (!type) {
        if (__DEV__) console.warn("[WS] received frame without type field");
        return;
      }

      const handler = _handlers.get(type);
      if (handler) {
        handler(data);
      } else {
        if (__DEV__) console.warn("[WS] no handler registered for type:", type);
      }
    } catch (err) {
      console.warn("[WS] failed to parse inbound frame", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  ws.onerror = (event) => {
    clearConnectTimeout();
    consecutiveFailures++;
    console.error("[WS] error event", {
      consecutiveFailures,
      eventType: event.type,
      readyState: readyStateLabel(ws?.readyState),
    });
  };

  ws.onclose = (event) => {
    clearConnectTimeout();
    if (__DEV__) console.warn("[WS] close", { code: event.code, reason: event.reason, wasClean: event.wasClean });
    ws = null;
    onStatus?.(false);
    if (event.code === 4001) {
      if (__DEV__) console.warn("[WS] auth rejected (4001)");
      onAuthFail?.();
      return;
    }
    if (event.code === 4002) {
      if (__DEV__) console.warn("[WS] superseded (4002)");
      return;
    }
    scheduleReconnect();
  };
}

/** Register a handler for a specific message type. Returns an unsubscribe function. */
export function registerHandler(type: string, handler: (data: unknown) => void): () => void {
  _handlers.set(type, handler);
  return () => _handlers.delete(type);
}

/**
 * Register handlers for chat_message and voice frames.
 * Returns an unsubscribe function — call it on logout to prevent stale closures.
 */
export function setMessageHandler(handler: (msg: InboundWireMessage) => void): () => void {
  const unsub1 = registerHandler("chat_message", handler as (data: unknown) => void);
  const unsub2 = registerHandler("voice",        handler as (data: unknown) => void);
  return () => { unsub1(); unsub2(); };
}

export function connectSocket(_token?: string) {
  if (__DEV__) console.log("[WS] connect requested");
  shouldReconnect = true;
  doConnect();
}

/** Send a chat or voice message frame. */
export function sendMessage(msg: WireMessage) {
  if (__DEV__) console.log("[WS] send", { to: msg.to, readyState: readyStateLabel(ws?.readyState) });
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }
  ws.send(JSON.stringify(msg));
}

/** Send a call signaling frame (offer, answer, ICE, decline, end). */
export function sendSignal(signal: OutboundCallSignal) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }
  ws.send(JSON.stringify(signal));
  if (__DEV__) console.log("[WS] call signal dispatched", { type: signal.type, to: signal.to });
}

export function disconnectSocket() {
  intentionalClose = true;
  shouldReconnect = false;
  if (__DEV__) console.log("[WS] disconnect requested");
  clearConnectTimeout();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  consecutiveFailures = 0;
  reconnectAttempt = 0;
  isConnecting = false;
  onStatus?.(false);
}

/** Set the connection status callback. Returns a cleanup function. */
export function setStatusHandler(handler: StatusHandler | null): () => void {
  onStatus = handler;
  return () => { onStatus = null; };
}

export function setAuthFailHandler(handler: AuthFailHandler) {
  onAuthFail = handler;
}
