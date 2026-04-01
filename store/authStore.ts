import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";

import * as api from "@/services/api";
import { generateKeyPair, clearKeys } from "@/crypto/cryptoService";
import {
  connectSocket,
  disconnectSocket,
  setAuthFailHandler,
} from "@/services/socket";
import { clearAllMessages } from "@/services/messageDb";
import { useChatStore } from "@/store/chatStore";
import { useCallStore } from "@/store/callStore";
import { usePresenceStore } from "@/store/presenceStore";

const TOKEN_SLOT = "whisper_jwt";
const USERNAME_SLOT = "whisper_username";

interface AuthStore {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  /** Check SecureStore for an existing session on app launch. */
  hydrate: () => Promise<void>;

  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

async function clearSession() {
  disconnectSocket();
  // Revoke the server session before clearing local credentials
  await api.logout();
  await clearKeys();
  await api.clearToken();
  await SecureStore.deleteItemAsync(USERNAME_SLOT);
  // Clear in-memory messages and DB (security wipe on logout)
  useChatStore.getState().reset();
  // Unregister call + presence socket handlers and clear their state
  useCallStore.getState().reset();
  usePresenceStore.getState().reset();
  await clearAllMessages();
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  username: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  hydrate: async () => {
    // When the WS detects an auth failure, auto-logout
    setAuthFailHandler(() => {
      useAuthStore.getState().logout();
    });

    try {
      const token = await SecureStore.getItemAsync(TOKEN_SLOT);
      const username = await SecureStore.getItemAsync(USERNAME_SLOT);
      if (token && username) {
        set({ token, username, isAuthenticated: true, isLoading: false });
        connectSocket(token);
        useCallStore.getState().registerSocketHandlers();
        usePresenceStore.getState().registerSocketHandlers();
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  register: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const publicKey = await generateKeyPair();
      await api.register(username, password, publicKey);

      // Auto-login after registration
      const token = await api.login(username, password);
      await SecureStore.setItemAsync(USERNAME_SLOT, username.toLowerCase());
      set({
        token,
        username: username.toLowerCase(),
        isAuthenticated: true,
        isLoading: false,
      });
      connectSocket(token);
      useCallStore.getState().registerSocketHandlers();
      usePresenceStore.getState().registerSocketHandlers();
    } catch (err) {
      set({ isLoading: false, error: api.extractErrorMessage(err) });
      throw err;
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const token = await api.login(username, password);

      // Generate a fresh keypair and push the new public key to the server.
      // This ensures we always have a local private key after login, even if
      // the previous one was cleared on logout or the device changed.
      const publicKey = await generateKeyPair();
      await api.updatePublicKey(publicKey);

      await SecureStore.setItemAsync(USERNAME_SLOT, username.toLowerCase());
      set({
        token,
        username: username.toLowerCase(),
        isAuthenticated: true,
        isLoading: false,
      });
      connectSocket(token);
      useCallStore.getState().registerSocketHandlers();
      usePresenceStore.getState().registerSocketHandlers();
    } catch (err) {
      set({ isLoading: false, error: api.extractErrorMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    await clearSession();
    set({
      token: null,
      username: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    router.replace("/(auth)/login");
  },

  clearError: () => set({ error: null }),
}));
