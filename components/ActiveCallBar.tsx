import { Pressable, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallStore } from "@/store/callStore";

/**
 * Persistent floating bar shown whenever a call is active but the user
 * has navigated away from the call screen.
 * Tap the bar to return to the call; tap the red button to end it.
 */
export default function ActiveCallBar() {
  const status = useCallStore((s) => s.status);
  const peerUsername = useCallStore((s) => s.peerUsername);
  const endCall = useCallStore((s) => s.endCall);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Only show when there is an active call AND the call screen is not visible
  const isOnCallScreen = pathname.startsWith("/(call)") || pathname.includes("/(call)/");
  if (status === "idle" || isOnCallScreen) return null;

  const label =
    status === "outgoing"   ? `Calling ${peerUsername}…` :
    status === "connecting" ? `Connecting…` :
    `In call with ${peerUsername}`;

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top + 4,
        left: 12,
        right: 12,
        zIndex: 9999,
        borderRadius: 16,
        backgroundColor: "#0f2a0f",
        borderWidth: 1,
        borderColor: "#22c55e33",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 12,
      }}
    >
      {/* Pulsing dot */}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#22c55e",
          marginRight: 10,
        }}
      />

      {/* Tap area — returns to call screen */}
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          if (peerUsername) router.push(`/(call)/${peerUsername}`);
        }}
      >
        <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>
          {label}
        </Text>
        <Text style={{ color: "#4ade80", fontSize: 11, marginTop: 1, opacity: 0.7 }}>
          Tap to return
        </Text>
      </Pressable>

      {/* End call button */}
      <Pressable
        onPress={endCall}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: pressed ? "#b91c1c" : "#ef4444",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 10,
        })}
      >
        <Ionicons
          name="call"
          size={16}
          color="white"
          style={{ transform: [{ rotate: "135deg" }] }}
        />
      </Pressable>
    </View>
  );
}
