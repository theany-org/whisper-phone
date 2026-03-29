import "@/crypto/polyfill";

import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "../global.css";

import { useAuthStore } from "@/store/authStore";
import { useServerStore } from "@/store/serverStore";
import { useSettingsStore } from "@/store/settingsStore";
import { initMessageDb } from "@/services/messageDb";

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateServer = useServerStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    // Load server URL first, then settings + DB, then auth
    hydrateServer().then(async () => {
      await hydrateSettings();
      await initMessageDb();
      await hydrateAuth();
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <Slot />
        <StatusBar style="light" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
