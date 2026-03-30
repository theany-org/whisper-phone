import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Must be set at module load time — controls whether notifications appear
// when the app is in the foreground (iOS requires this explicitly).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3B82F6",
  });
}

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  if (existing === "denied") return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

function buildNotificationBody(text: string): string {
  // Future: if (text === "__voice__") return "Voice message 🎤";
  return text.length > 100 ? text.slice(0, 97) + "…" : text;
}

export async function scheduleMessageNotification(
  sender: string,
  text: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: sender,
      body: buildNotificationBody(text),
      data: { sender },
      ...(Platform.OS === "android" && { channelId: "messages" }),
    },
    trigger: null,
  });
}

export function handleNotificationTap(
  callback: (sender: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const sender = response.notification.request.content.data
        ?.sender as string | undefined;
      if (sender) callback(sender);
    }
  );
  return () => sub.remove();
}
