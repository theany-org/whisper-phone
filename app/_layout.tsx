import "@/crypto/polyfill";

import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "../global.css";

import { useAuthStore } from "@/store/authStore";
import { useServerStore } from "@/store/serverStore";

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateServer = useServerStore((s) => s.hydrate);

  useEffect(() => {
    // Load server URL first, then auth (auth needs the correct server URL)
    hydrateServer().then(() => hydrateAuth());
  }, []);

  return (
    <KeyboardProvider>
      <Slot />
      <StatusBar style="light" />
    </KeyboardProvider>
  );
}
