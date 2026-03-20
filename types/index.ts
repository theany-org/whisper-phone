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

/** Wire format sent/received over WebSocket */
export interface WireMessage {
  to: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
}

/** Inbound message from server includes `from` instead of `to` */
export interface InboundWireMessage {
  from: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
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
