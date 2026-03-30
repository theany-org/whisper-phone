import { create } from "zustand";

import * as api from "@/services/api";
import { encryptMessage, decryptMessage, encryptBytes, decryptBytes } from "@/crypto/cryptoService";
import { sendMessage, setMessageHandler } from "@/services/socket";
import { saveMessage, loadAllMessages } from "@/services/messageDb";
import { useSettingsStore } from "@/store/settingsStore";
import { scheduleMessageNotification } from "@/services/notificationService";
import { readAudioFileAsBytes, writeTempAudioFile } from "@/services/audioService";
import type { ChatMessage, Conversation, InboundWireMessage, ReplyInfo } from "@/types";

// Always fetch the recipient's current public key from the server.
// Caching was removed because recipients regenerate their keypair on every
// login (forward secrecy). A stale cached key causes decryption to fail
// silently — correctness beats the minor latency saving.
async function getPublicKey(username: string): Promise<string> {
  return api.fetchPublicKey(username);
}

interface ChatStore {
  /** username -> messages */
  messages: Record<string, ChatMessage[]>;
  conversations: Conversation[];
  connected: boolean;

  /** The peer whose chat screen is currently open. Notifications are suppressed for this peer. */
  activePeer: string | null;
  setActivePeer: (username: string) => void;
  clearActivePeer: () => void;

  /** Initialize the inbound message handler (call once after auth). */
  initSocket: (myUsername: string) => Promise<void>;

  /** Encrypt and send a message to `recipient`. */
  send: (myUsername: string, recipient: string, plaintext: string, replyTo?: ReplyInfo) => Promise<void>;

  /** Encrypt and send a voice message to `recipient`. */
  sendVoice: (myUsername: string, recipient: string, audioUri: string, duration: number) => Promise<void>;

  setConnected: (v: boolean) => void;

  /** Start a new conversation stub if it doesn't exist. */
  ensureConversation: (username: string) => void;

  /** Clear all in-memory messages and conversations. */
  reset: () => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function messagePreview(msg: ChatMessage): string {
  return msg.type === "voice" ? "🎤 Voice message" : msg.text;
}

function buildConversations(messages: Record<string, ChatMessage[]>): Conversation[] {
  return Object.entries(messages)
    .map(([username, msgs]) => {
      const last = msgs[msgs.length - 1];
      return {
        username,
        lastMessage: last ? messagePreview(last) : "",
        lastTimestamp: last?.timestamp ?? 0,
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
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
  activePeer: null,
  setActivePeer: (username) => set({ activePeer: username }),
  clearActivePeer: () => set({ activePeer: null }),

  initSocket: async (myUsername) => {
    // Load persisted messages if enabled
    if (useSettingsStore.getState().localPersistence) {
      try {
        const saved = await loadAllMessages();
        if (Object.keys(saved).length > 0) {
          set({ messages: saved, conversations: buildConversations(saved) });
        }
      } catch (err) {
        console.warn("[CHAT_INIT] Failed to load persisted messages", describeError(err));
      }
    }

    setMessageHandler(async (wire: InboundWireMessage) => {
      try {
        const senderPub = await getPublicKey(wire.from);
        const msgId = makeId();

        let msg: ChatMessage;
        let notifBody: string;

        if (wire.type === "voice") {
          const audioBytes = await decryptBytes(wire.ciphertext, wire.nonce, senderPub);
          const audioUri = writeTempAudioFile(msgId, audioBytes);

          msg = {
            id: msgId,
            from: wire.from,
            to: myUsername,
            text: "",
            type: "voice",
            duration: wire.duration,
            audioUri,
            timestamp: wire.timestamp,
            isMine: false,
            status: "sent",
          };
          notifBody = "🎤 Voice message";
        } else {
          const decrypted = await decryptMessage(wire.ciphertext, wire.nonce, senderPub);

          // Support structured payload { text, replyTo } or plain string (backward compat)
          let text: string;
          let replyTo: ReplyInfo | undefined;
          try {
            const parsed = JSON.parse(decrypted);
            if (parsed && typeof parsed.text === "string") {
              text = parsed.text;
              replyTo = parsed.replyTo;
            } else {
              text = decrypted;
            }
          } catch {
            text = decrypted;
          }

          msg = {
            id: msgId,
            from: wire.from,
            to: myUsername,
            text,
            type: "text",
            timestamp: wire.timestamp,
            isMine: false,
            status: "sent",
            replyTo,
          };
          notifBody = text.length > 100 ? text.slice(0, 97) + "…" : text;
        }

        set((state) => {
          const key = wire.from;
          const existing = state.messages[key] ?? [];
          const updated = { ...state.messages, [key]: [...existing, msg] };

          const convs = state.conversations.filter((c) => c.username !== key);
          convs.unshift({
            username: key,
            lastMessage: messagePreview(msg),
            lastTimestamp: wire.timestamp,
          });

          return { messages: updated, conversations: convs };
        });

        if (useSettingsStore.getState().localPersistence) {
          saveMessage(wire.from, msg).catch((err) =>
            console.warn("[CHAT_RECV] Failed to persist message", describeError(err))
          );
        }

        // Show local notification only when the sender's chat is not open
        if (get().activePeer !== wire.from) {
          scheduleMessageNotification(wire.from, notifBody).catch(() => {});
        }
      } catch (err) {
        console.warn("[CHAT_RECV] Failed to process inbound message", {
          from: wire.from,
          timestamp: wire.timestamp,
          error: describeError(err),
        });
      }
    });
  },

  send: async (myUsername, recipient, plaintext, replyTo?) => {
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
      replyTo,
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

    if (useSettingsStore.getState().localPersistence) {
      saveMessage(recipient, optimistic).catch(() => {});
    }

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
      // Wrap as JSON so reply metadata is encrypted alongside the text
      const payload = replyTo
        ? JSON.stringify({ text: plaintext, replyTo })
        : plaintext;
      const { ciphertext, nonce } = await encryptMessage(payload, recipientPub);
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

      if (useSettingsStore.getState().localPersistence) {
        const sentMsg = { ...optimistic, status: "sent" as const };
        saveMessage(recipient, sentMsg).catch(() => {});
      }
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

      if (useSettingsStore.getState().localPersistence) {
        const failedMsg = { ...optimistic, status: "failed" as const };
        saveMessage(recipient, failedMsg).catch(() => {});
      }
    }
  },

  sendVoice: async (myUsername, recipient, audioUri, duration) => {
    const ts = Math.floor(Date.now() / 1000);
    const tempId = makeId();

    const optimistic: ChatMessage = {
      id: tempId,
      from: myUsername,
      to: recipient,
      text: "",
      type: "voice",
      duration,
      audioUri,
      timestamp: ts,
      isMine: true,
      status: "sending",
    };

    set((state) => {
      const existing = state.messages[recipient] ?? [];
      return {
        messages: { ...state.messages, [recipient]: [...existing, optimistic] },
      };
    });

    try {
      const recipientPub = await getPublicKey(recipient);
      const audioBytes = await readAudioFileAsBytes(audioUri);
      const { ciphertext, nonce } = await encryptBytes(audioBytes, recipientPub);

      sendMessage({ to: recipient, type: "voice", ciphertext, nonce, duration, timestamp: ts });

      set((state) => {
        const msgs = (state.messages[recipient] ?? []).map((m) =>
          m.id === tempId ? { ...m, status: "sent" as const } : m
        );
        const convs = state.conversations.filter((c) => c.username !== recipient);
        convs.unshift({ username: recipient, lastMessage: "🎤 Voice message", lastTimestamp: ts });
        return { messages: { ...state.messages, [recipient]: msgs }, conversations: convs };
      });

      if (useSettingsStore.getState().localPersistence) {
        const sentMsg = { ...optimistic, status: "sent" as const };
        saveMessage(recipient, sentMsg).catch(() => {});
      }
    } catch (err) {
      console.error("[CHAT_SEND_VOICE] failed", { to: recipient, error: describeError(err) });
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

  reset: () => set({ messages: {}, conversations: [] }),
}));
