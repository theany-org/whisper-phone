export interface User {
  username: string;
  publicKey: string;
}

export interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/** Wire format sent/received over WebSocket (chat messages only) */
export interface WireMessage {
  type: "chat_message" | "voice";
  to: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
  duration?: number;
}

/** Inbound chat message from server — includes `from` instead of `to` */
export interface InboundWireMessage {
  type: "chat_message" | "voice";
  from: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
  duration?: number;
}

export interface ReplyInfo {
  id: string;
  text: string;
  from: string;
}

/** Decrypted message for UI display */
export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: number;
  isMine: boolean;
  status: "sending" | "sent" | "failed";
  replyTo?: ReplyInfo;
  type: "text" | "voice";
  /** Duration in seconds (voice messages only) */
  duration?: number;
  /** Local cache URI for playback (voice, ephemeral — never persisted to DB) */
  audioUri?: string;
}

export interface Conversation {
  username: string;
  lastMessage: string;
  lastTimestamp: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface PublicKeyResponse {
  username: string;
  public_key: string;
}

export interface ApiError {
  detail: string;
}
