import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const SETTINGS_SLOT = "whisper_settings";

interface SettingsStore {
  localPersistence: boolean;
  isReady: boolean;
  hydrate(): Promise<void>;
  setLocalPersistence(v: boolean): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  localPersistence: false,
  isReady: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SETTINGS_SLOT);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          localPersistence: parsed.localPersistence ?? false,
          isReady: true,
        });
      } else {
        set({ isReady: true });
      }
    } catch {
      set({ isReady: true });
    }
  },

  setLocalPersistence: async (v: boolean) => {
    set({ localPersistence: v });
    try {
      await SecureStore.setItemAsync(
        SETTINGS_SLOT,
        JSON.stringify({ localPersistence: v }),
      );
    } catch {
      // If SecureStore fails, setting is still updated in memory
    }
  },
}));
