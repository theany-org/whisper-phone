import { create } from "zustand";

import * as api from "@/services/api";
import { encryptMessage, decryptMessage } from "@/crypto/cryptoService";
import { sendMessage, setMessageHandler } from "@/services/socket";
import type { ChatMessage, Conversation, InboundWireMessage } from "@/types";

// In-memory public key cache (never persisted)
const pubKeyCache = new Map<string, string>();

async function getPublicKey(username: string): Promise<string> {
  const cached = pubKeyCache.get(username);
  if (cached) return cached;
  const key = await api.fetchPublicKey(username);
  pubKeyCache.set(username, key);
  return key;
}

interface ChatStore {
  /** username -> messages */
  messages: Record<string, ChatMessage[]>;
  conversations: Conversation[];
  connected: boolean;

  /** Initialize the inbound message handler (call once after auth). */
  initSocket: (myUsername: string) => void;

  /** Encrypt and send a message to `recipient`. */
  send: (myUsername: string, recipient: string, plaintext: string) => Promise<void>;

  setConnected: (v: boolean) => void;

  /** Start a new conversation stub if it doesn't exist. */
  ensureConversation: (username: string) => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},
  conversations: [],
  connected: false,

  initSocket: (myUsername) => {
    setMessageHandler(async (wire: InboundWireMessage) => {
      try {
        const senderPub = await getPublicKey(wire.from);
        const plaintext = await decryptMessage(
          wire.ciphertext,
          wire.nonce,
          senderPub
        );

        const msg: ChatMessage = {
          id: makeId(),
          from: wire.from,
          to: myUsername,
          text: plaintext,
          timestamp: wire.timestamp,
          isMine: false,
          status: "sent",
        };

        set((state) => {
          const key = wire.from;
          const existing = state.messages[key] ?? [];
          const updated = { ...state.messages, [key]: [...existing, msg] };

          // Upsert conversation
          const convs = state.conversations.filter((c) => c.username !== key);
          convs.unshift({
            username: key,
            lastMessage: plaintext,
            lastTimestamp: wire.timestamp,
          });

          return { messages: updated, conversations: convs };
        });
      } catch (err) {
        console.warn("[CHAT_RECV] Failed to decrypt inbound message", {
          from: wire.from,
          timestamp: wire.timestamp,
          error: describeError(err),
        });
      }
    });
  },

  send: async (myUsername, recipient, plaintext) => {
    const ts = Math.floor(Date.now() / 1000);
    const tempId = makeId();

    // Optimistic UI update
    const optimistic: ChatMessage = {
      id: tempId,
      from: myUsername,
      to: recipient,
      text: plaintext,
      timestamp: ts,
      isMine: true,
      status: "sending",
    };

    set((state) => {
      const existing = state.messages[recipient] ?? [];
      return {
        messages: {
          ...state.messages,
          [recipient]: [...existing, optimistic],
        },
      };
    });

    try {
      console.log("[CHAT_SEND] start", {
        from: myUsername,
        to: recipient,
        textLength: plaintext.length,
        tempId,
      });

      const recipientPub = await getPublicKey(recipient);
      console.log("[CHAT_SEND] recipient public key fetched", {
        to: recipient,
        publicKeyLength: recipientPub.length,
      });

      console.log("[CHAT_SEND] encrypt start", { to: recipient, tempId });
      const { ciphertext, nonce } = await encryptMessage(plaintext, recipientPub);
      console.log("[CHAT_SEND] encrypt success", {
        to: recipient,
        ciphertextLength: ciphertext.length,
        nonceLength: nonce.length,
        tempId,
      });

      console.log("[CHAT_SEND] ws send start", { to: recipient, tempId, timestamp: ts });
      sendMessage({ to: recipient, ciphertext, nonce, timestamp: ts });
      console.log("[CHAT_SEND] ws send success", { to: recipient, tempId });

      // Mark sent
      set((state) => {
        const msgs = (state.messages[recipient] ?? []).map((m) =>
          m.id === tempId ? { ...m, status: "sent" as const } : m
        );

        const convs = state.conversations.filter(
          (c) => c.username !== recipient
        );
        convs.unshift({
          username: recipient,
          lastMessage: plaintext,
          lastTimestamp: ts,
        });

        return { messages: { ...state.messages, [recipient]: msgs }, conversations: convs };
      });
    } catch (err) {
      console.error("[CHAT_SEND] failed", {
        from: myUsername,
        to: recipient,
        tempId,
        error: describeError(err),
      });

      // Mark failed
      set((state) => {
        const msgs = (state.messages[recipient] ?? []).map((m) =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        );
        return { messages: { ...state.messages, [recipient]: msgs } };
      });
    }
  },

  setConnected: (v) => set({ connected: v }),

  ensureConversation: (username) => {
    set((state) => {
      if (state.conversations.some((c) => c.username === username)) return state;
      return {
        conversations: [
          ...state.conversations,
          { username, lastMessage: "", lastTimestamp: Date.now() / 1000 },
        ],
      };
    });
  },
}));
