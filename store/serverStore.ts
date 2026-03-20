import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const SERVER_URL_SLOT = "whisper_server_url";

/** Change this to your production API domain. */
const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_WHISPER_API_URL! || "https://whisper.theany.ir";

interface ServerStore {
  /** The current server base URL (e.g. "https://whisper.theany.ir") */
  serverUrl: string;
  /** True once the persisted value has been loaded */
  isReady: boolean;

  /** Load the saved URL from SecureStore (call once at startup). */
  hydrate: () => Promise<void>;

  /** Persist a new server URL. Pass empty string to reset to default. */
  setServerUrl: (url: string) => Promise<void>;
}

function deriveUrls(base: string) {
  const clean = base.replace(/\/+$/, "");
  const wsScheme = clean.startsWith("https") ? "wss" : "ws";
  const wsUrl = clean.replace(/^https?/, wsScheme);
  return { apiBaseUrl: clean, wsBaseUrl: wsUrl };
}

export const useServerStore = create<ServerStore>((set) => ({
  serverUrl: DEFAULT_SERVER_URL,
  isReady: false,

  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(SERVER_URL_SLOT);
      if (saved) {
        set({ serverUrl: saved, isReady: true });
      } else {
        set({ isReady: true });
      }
    } catch {
      set({ isReady: true });
    }
  },

  setServerUrl: async (url: string) => {
    const value = url.trim() || DEFAULT_SERVER_URL;
    await SecureStore.setItemAsync(SERVER_URL_SLOT, value);
    set({ serverUrl: value });
  },
}));

/** Get the current HTTP and WS base URLs derived from the server URL. */
export function getUrls() {
  const { serverUrl } = useServerStore.getState();
  return deriveUrls(serverUrl);
}

export { DEFAULT_SERVER_URL };
