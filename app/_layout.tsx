import "@/crypto/polyfill";

import { useEffect, useRef } from "react";
import { Slot, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "../global.css";
import * as Notifications from "expo-notifications";

import { useAuthStore } from "@/store/authStore";
import { useServerStore } from "@/store/serverStore";
import { useSettingsStore } from "@/store/settingsStore";
import { initMessageDb } from "@/services/messageDb";
import {
  setNotificationChannel,
  requestPermissions,
} from "@/services/notificationService";

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateServer = useServerStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const lastNotification = Notifications.useLastNotificationResponse();
  const handledNotifId = useRef<string | null>(null);

  useEffect(() => {
    // Load server URL first, then settings + DB, then auth
    hydrateServer().then(async () => {
      await hydrateSettings();
      await initMessageDb();
      await hydrateAuth();
    });
  }, []);

  // Navigate to the sender's chat when a notification is tapped.
  // The ref prevents double-navigation: useLastNotificationResponse fires for
  // both background and cold-start taps, so we track the last handled ID.
  useEffect(() => {
    if (!lastNotification) return;
    const id = lastNotification.notification.request.identifier;
    if (handledNotifId.current === id) return;
    handledNotifId.current = id;
    const sender = lastNotification.notification.request.content.data
      ?.sender as string | undefined;
    if (sender) router.push(`/(chat)/${sender}`);
  }, [lastNotification]);

  useEffect(() => {
    setNotificationChannel();
    requestPermissions();
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
