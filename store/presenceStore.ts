import { create } from "zustand";
import { registerHandler } from "@/services/socket";

interface PresenceState {
  onlineUsers: Set<string>;
  setOnline: (username: string) => void;
  setOffline: (username: string) => void;
  setSnapshot: (usernames: string[]) => void;
  registerSocketHandlers: () => void;
  /** Unregister handlers and clear online state — call on logout. */
  reset: () => void;
}

// Kept outside the store so unsubscribes survive store re-renders
let _presenceUnsubs: (() => void)[] = [];

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set(),

  setOnline: (username) =>
    set((s) => ({ onlineUsers: new Set([...s.onlineUsers, username]) })),

  setOffline: (username) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(username);
      return { onlineUsers: next };
    }),

  setSnapshot: (usernames) =>
    set({ onlineUsers: new Set(usernames) }),

  registerSocketHandlers: () => {
    // Clean up any previous registrations first (e.g. re-login in same session)
    _presenceUnsubs.forEach((u) => u());

    _presenceUnsubs = [
      registerHandler("user_online", (data) => {
        const msg = data as { username: string };
        usePresenceStore.getState().setOnline(msg.username);
      }),
      registerHandler("user_offline", (data) => {
        const msg = data as { username: string };
        usePresenceStore.getState().setOffline(msg.username);
      }),
      registerHandler("presence_snapshot", (data) => {
        const msg = data as { online: string[] };
        usePresenceStore.getState().setSnapshot(msg.online);
      }),
    ];
  },

  reset: () => {
    _presenceUnsubs.forEach((u) => u());
    _presenceUnsubs = [];
    set({ onlineUsers: new Set() });
  },
}));
