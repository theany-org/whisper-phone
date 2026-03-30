import { Ionicons } from "@expo/vector-icons";
import { Alert, Linking, Pressable, Switch, Text, View } from "react-native";
import { Stack } from "expo-router";

import { useSettingsStore } from "@/store/settingsStore";
import { clearAllMessages } from "@/services/messageDb";
import { useChatStore } from "@/store/chatStore";

export default function SettingsScreen() {
  const { localPersistence, setLocalPersistence } = useSettingsStore();
  const reset = useChatStore((s) => s.reset);

  const handleToggle = (value: boolean) => {
    if (value) {
      setLocalPersistence(true);
    } else {
      Alert.alert(
        "Clear saved messages?",
        "This will delete all locally stored messages.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear & Disable",
            style: "destructive",
            onPress: async () => {
              await clearAllMessages();
              reset();
              await setLocalPersistence(false);
            },
          },
        ]
      );
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Stack.Screen
          options={{
            title: "Settings",
            headerStyle: { backgroundColor: "#000" },
            headerTintColor: "#fff",
          }}
        />

        <Text
          style={{
            color: "#666",
            fontSize: 12,
            fontWeight: "600",
            marginTop: 28,
            marginBottom: 8,
            marginHorizontal: 16,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Privacy
        </Text>

        <View
          style={{
            backgroundColor: "#111",
            borderRadius: 12,
            marginHorizontal: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "500" }}>
              Save Message History
            </Text>
            <Switch
              value={localPersistence}
              onValueChange={handleToggle}
              trackColor={{ false: "#333", true: "#007AFF" }}
              thumbColor="#fff"
            />
          </View>
          <Text style={{ color: "#666", fontSize: 13, marginTop: 6, lineHeight: 18 }}>
            Messages are stored in plain text on this device. Disable to keep no local record.
          </Text>
        </View>
      </View>

      <View style={{ paddingBottom: 28, paddingHorizontal: 16, gap: 16 }}>
        <Text
          style={{
            color: "#666",
            fontSize: 12,
            fontWeight: "600",
            marginBottom: 8,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          About
        </Text>

        <View
          style={{
            backgroundColor: "#111",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 4,
          }}
        >
          <Pressable
            onPress={() => Linking.openURL("https://github.com/theany-org/whisper-phone")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#1a1a1a",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="logo-github" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15 }}>App Repository</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL("https://github.com/theany-org/whisper-server")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#1a1a1a",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="logo-github" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15 }}>Server Repository</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL("https://t.me/whisper_messenger")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#1a1a1a",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15 }}>Telegram Channel</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL("https://t.me/+50Qn1caEWe4zOTkx")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="people" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15 }}>Telegram Group</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </Pressable>
        </View>

        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            paddingTop: 8,
            gap: 6,
          }}
        >
          <Text style={{ color: "#666", fontSize: 13 }}>Made with</Text>
          <Ionicons name="heart" size={14} color="#ef4444" />
          <Text style={{ color: "#666", fontSize: 13 }}>by Sullivan</Text>
        </View>
      </View>
    </View>
  );
}
