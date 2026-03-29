import { getWsBaseUrl } from "./config";
import { fetchWsTicket } from "./api";
import type { InboundWireMessage, WireMessage } from "@/types";

type MessageHandler = (msg: InboundWireMessage) => void;
type StatusHandler = (connected: boolean) => void;
type AuthFailHandler = () => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

let ws: WebSocket | null = null;
let onMessage: MessageHandler | null = null;
let onStatus: StatusHandler | null = null;
let onAuthFail: AuthFailHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let consecutiveFailures = 0;
let shouldReconnect = false;
let intentionalClose = false;
let isConnecting = false; // guards the async gap between null-check and socket creation

function readyStateLabel(state?: number | null): string {
  if (state === WebSocket.CONNECTING) return "CONNECTING";
  if (state === WebSocket.OPEN) return "OPEN";
  if (state === WebSocket.CLOSING) return "CLOSING";
  if (state === WebSocket.CLOSED) return "CLOSED";
  return "NO_SOCKET";
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
  console.warn("[WS] scheduling reconnect", {
    reconnectAttempt,
    consecutiveFailures,
    delayMs: delay,
  });
  reconnectTimer = setTimeout(() => {
    reconnectAttempt++;
    console.log("[WS] reconnect attempt", { reconnectAttempt });
    doConnect();
  }, delay);
}

async function doConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log("[WS] connect skipped - socket already active");
    return;
  }
  if (isConnecting) {
    console.log("[WS] connect skipped - ticket fetch already in flight");
    return;
  }
  isConnecting = true;

  // Fetch a short-lived, single-use ticket via authenticated HTTP
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
  console.log("[WS] socket created");

  ws.onopen = () => {
    reconnectAttempt = 0;
    consecutiveFailures = 0;
    console.log("[WS] open");
    onStatus?.(true);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string);
      if ("error" in data) {
        console.warn("[WS] server error:", data.error);
        return;
      }
      if (data.type === "status") {
        console.log("[WS] delivery status", { to: data.to, delivered: data.delivered });
        return;
      }
      onMessage?.(data as InboundWireMessage);
    } catch (err) {
      console.warn("[WS] failed to parse inbound frame", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  ws.onerror = (event) => {
    consecutiveFailures++;
    console.error("[WS] error event", {
      consecutiveFailures,
      eventType: event.type,
      readyState: readyStateLabel(ws?.readyState),
    });
  };

  ws.onclose = (event) => {
    console.warn("[WS] close", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      intentionalClose,
    });
    ws = null;
    onStatus?.(false);
    if (event.code === 4001) {
      console.warn("[WS] auth rejected (4001)");
      onAuthFail?.();
      return;
    }
    if (event.code === 4002) {
      // Superseded by another connection — don't reconnect
      console.warn("[WS] superseded (4002)");
      return;
    }
    scheduleReconnect();
  };
}

/** Initiate a WebSocket connection. The token param is accepted for
 *  backward-compat with callers but is no longer sent over the wire —
 *  a short-lived ticket is fetched instead. */
export function connectSocket(_token?: string) {
  console.log("[WS] connect requested");
  shouldReconnect = true;
  doConnect();
}

export function sendMessage(msg: WireMessage) {
  console.log("[WS] send requested", {
    to: msg.to,
    hasSocket: Boolean(ws),
    readyState: readyStateLabel(ws?.readyState),
  });
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }
  ws.send(JSON.stringify(msg));
  console.log("[WS] send frame dispatched", { to: msg.to });
}

export function disconnectSocket() {
  intentionalClose = true;
  shouldReconnect = false;
  console.log("[WS] disconnect requested");
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

export function setMessageHandler(handler: MessageHandler) {
  onMessage = handler;
}

export function setStatusHandler(handler: StatusHandler) {
  onStatus = handler;
}

export function setAuthFailHandler(handler: AuthFailHandler) {
  onAuthFail = handler;
}
