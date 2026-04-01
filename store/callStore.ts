import { Alert } from "react-native";
import { router } from "expo-router";
import { create } from "zustand";

import { registerHandler, sendSignal } from "@/services/socket";
import type {
  CallStatus,
  InboundCallAnswer,
  InboundCallBusy,
  InboundCallDecline,
  InboundCallEnd,
  InboundCallIce,
  InboundCallOffer,
  InboundCallUnavailable,
  RTCIceCandidateInit,
  RTCSessionDescriptionInit,
} from "@/types/call";

// Lazily imported to avoid circular deps — callStore imports callWebrtc only
// at call-time so the module graph stays acyclic.
import * as callWebrtc from "@/services/callWebrtc";
import { deactivateCallAudioSession } from "@/services/audioSession";

// Kept outside the store so unsubscribes survive store re-renders
let _callHandlerUnsubs: (() => void)[] = [];

interface CallStore {
  status: CallStatus;
  callId: string | null;
  peerUsername: string | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  incomingOffer: RTCSessionDescriptionInit | null;

  // ─── Outgoing ────────────────────────────────────────────────────────────
  startOutgoingCall: (peerUsername: string) => void;

  // ─── Incoming ────────────────────────────────────────────────────────────
  receiveIncomingCall: (signal: InboundCallOffer) => void;
  acceptCall: () => void;
  declineCall: () => void;

  // ─── In-call ─────────────────────────────────────────────────────────────
  endCall: () => void;
  setMuted: (v: boolean) => void;
  setSpeaker: (v: boolean) => void;
  setStatus: (status: CallStatus) => void;

  // ─── Inbound signal handlers (called from socket dispatch) ───────────────
  handleRemoteAnswer: (signal: InboundCallAnswer) => void;
  handleRemoteIce: (signal: InboundCallIce) => void;
  handleCallDeclined: (signal: InboundCallDecline) => void;
  handleCallBusy: (signal: InboundCallBusy) => void;
  handleCallEnded: (signal: InboundCallEnd) => void;
  handleCallUnavailable: (signal: InboundCallUnavailable) => void;

  // ─── Init ─────────────────────────────────────────────────────────────────
  /** Register all call signal handlers into socket.ts dispatch. Call once at app init. */
  registerSocketHandlers: () => void;

  reset: () => void;
}

function makeCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function teardown() {
  callWebrtc.close();
  deactivateCallAudioSession().catch(() => {});
}

export const useCallStore = create<CallStore>((set, get) => ({
  status: "idle",
  callId: null,
  peerUsername: null,
  isMuted: false,
  isSpeakerOn: false,
  incomingOffer: null,

  startOutgoingCall: (peerUsername) => {
    const callId = makeCallId();
    set({ status: "outgoing", callId, peerUsername, isMuted: false, isSpeakerOn: false });
    router.push(`/(call)/${peerUsername}`);
  },

  receiveIncomingCall: (signal) => {
    const { status } = get();
    // Already in a call — the server should have sent call_busy, but guard anyway
    if (status !== "idle") {
      sendSignal({ type: "call_decline", call_id: signal.call_id, to: signal.from });
      return;
    }
    set({
      status: "incoming",
      callId: signal.call_id,
      peerUsername: signal.from,
      incomingOffer: signal.sdp,
      isMuted: false,
      isSpeakerOn: false,
    });
  },

  acceptCall: () => {
    const { status, peerUsername } = get();
    if (status !== "incoming" || !peerUsername) return;
    set({ status: "connecting" });
    router.push(`/(call)/${peerUsername}`);
  },

  declineCall: () => {
    const { status, callId, peerUsername } = get();
    if (status !== "incoming" || !callId || !peerUsername) return;
    sendSignal({ type: "call_decline", call_id: callId, to: peerUsername });
    get().reset();
  },

  endCall: () => {
    const { status, callId, peerUsername } = get();
    if (status === "idle") return;
    if (callId && peerUsername) {
      try {
        sendSignal({ type: "call_end", call_id: callId, to: peerUsername });
      } catch {
        // WS may be closed — ignore send error on end
      }
    }
    teardown();
    get().reset();
  },

  setMuted: (v) => {
    callWebrtc.toggleMute(v);
    set({ isMuted: v });
  },

  setSpeaker: (v) => {
    set({ isSpeakerOn: v });
  },

  setStatus: (status) => set({ status }),

  // ─── Inbound signal handlers ──────────────────────────────────────────────

  handleRemoteAnswer: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return; // stale signal guard
    callWebrtc.setRemoteAnswer(signal.sdp).catch((err) =>
      console.error("[CALL] setRemoteAnswer failed", err)
    );
    set({ status: "active" });
  },

  handleRemoteIce: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return;
    callWebrtc.addIceCandidate(signal.candidate as RTCIceCandidateInit).catch((err) =>
      console.warn("[CALL] addIceCandidate failed", err)
    );
  },

  handleCallDeclined: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return;
    teardown();
    get().reset();
    Alert.alert("Call declined", `${signal.from} declined your call.`);
  },

  handleCallBusy: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return;
    teardown();
    get().reset();
    Alert.alert("Line busy", `${signal.from} is already in a call.`);
  },

  handleCallEnded: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return;
    teardown();
    get().reset();
  },

  handleCallUnavailable: (signal) => {
    const { callId } = get();
    if (signal.call_id !== callId) return;
    teardown();
    get().reset();
    Alert.alert("Unavailable", "The other user is not online.");
  },

  // ─── Init ────────────────────────────────────────────────────────────────

  registerSocketHandlers: () => {
    // Clean up any previous registrations first (e.g. re-login in same session)
    _callHandlerUnsubs.forEach((u) => u());

    const store = get();
    _callHandlerUnsubs = [
      registerHandler("call_offer",         (data) => store.receiveIncomingCall(data as InboundCallOffer)),
      registerHandler("call_answer",        (data) => store.handleRemoteAnswer(data as InboundCallAnswer)),
      registerHandler("call_ice_candidate", (data) => store.handleRemoteIce(data as InboundCallIce)),
      registerHandler("call_decline",       (data) => store.handleCallDeclined(data as InboundCallDecline)),
      registerHandler("call_busy",          (data) => store.handleCallBusy(data as InboundCallBusy)),
      registerHandler("call_end",           (data) => store.handleCallEnded(data as InboundCallEnd)),
      registerHandler("call_unavailable",   (data) => store.handleCallUnavailable(data as InboundCallUnavailable)),
    ];

    // Wire ICE candidate callback — when WebRTC fires a local ICE candidate,
    // send it to the peer over the existing WebSocket.
    callWebrtc.onIceCandidate((candidate) => {
      const { callId, peerUsername } = get();
      if (candidate && callId && peerUsername) {
        sendSignal({
          type: "call_ice_candidate",
          call_id: callId,
          to: peerUsername,
          candidate,
        });
      }
    });
  },

  reset: () => {
    _callHandlerUnsubs.forEach((u) => u());
    _callHandlerUnsubs = [];
    set({
      status: "idle",
      callId: null,
      peerUsername: null,
      isMuted: false,
      isSpeakerOn: false,
      incomingOffer: null,
    });
  },
}));
