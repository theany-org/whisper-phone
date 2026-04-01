// Minimal SDP/ICE types — mirrors what react-native-webrtc uses internally
// without relying on unexported type names from that package.
export interface RTCSessionDescriptionInit {
  type: string | null;
  sdp: string;
}

export interface RTCIceCandidateInit {
  candidate?: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
}

// ─── Outbound signals (client → server) ──────────────────────────────────────

export interface CallOfferSignal {
  type: "call_offer";
  call_id: string;
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallAnswerSignal {
  type: "call_answer";
  call_id: string;
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallIceSignal {
  type: "call_ice_candidate";
  call_id: string;
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface CallDeclineSignal {
  type: "call_decline";
  call_id: string;
  to: string;
}

export interface CallEndSignal {
  type: "call_end";
  call_id: string;
  to: string;
}

export type OutboundCallSignal =
  | CallOfferSignal
  | CallAnswerSignal
  | CallIceSignal
  | CallDeclineSignal
  | CallEndSignal;

// ─── Inbound signals (server → client) ───────────────────────────────────────

export interface InboundCallOffer {
  type: "call_offer";
  call_id: string;
  from: string;
  sdp: RTCSessionDescriptionInit;
}

export interface InboundCallAnswer {
  type: "call_answer";
  call_id: string;
  from: string;
  sdp: RTCSessionDescriptionInit;
}

export interface InboundCallIce {
  type: "call_ice_candidate";
  call_id: string;
  from: string;
  candidate: RTCIceCandidateInit;
}

export interface InboundCallDecline {
  type: "call_decline";
  call_id: string;
  from: string;
}

export interface InboundCallBusy {
  type: "call_busy";
  call_id: string;
  from: string;
}

export interface InboundCallEnd {
  type: "call_end";
  call_id: string;
  from: string;
}

export interface InboundCallUnavailable {
  type: "call_unavailable";
  call_id: string;
}

export type InboundCallSignal =
  | InboundCallOffer
  | InboundCallAnswer
  | InboundCallIce
  | InboundCallDecline
  | InboundCallBusy
  | InboundCallEnd
  | InboundCallUnavailable;

// ─── Call state ───────────────────────────────────────────────────────────────

export type CallStatus =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active";

export interface CallState {
  status: CallStatus;
  callId: string | null;
  peerUsername: string | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  incomingOffer: RTCSessionDescriptionInit | null;
}
