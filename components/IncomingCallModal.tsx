import { useEffect } from "react";
import { Modal, Pressable, Text, Vibration, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useCallStore } from "@/store/callStore";

const VIBRATION_PATTERN = [0, 800, 400];

function PulseAvatar({ initial }: { initial: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => {
      scale.value = 1;
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: "#1a2e1a",
          borderWidth: 2,
          borderColor: "#22c55e33",
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Text style={{ color: "#22c55e", fontSize: 36, fontWeight: "300" }}>
        {initial}
      </Text>
    </Animated.View>
  );
}

export default function IncomingCallModal() {
  const status = useCallStore((s) => s.status);
  const peerUsername = useCallStore((s) => s.peerUsername);
  const acceptCall = useCallStore((s) => s.acceptCall);
  const declineCall = useCallStore((s) => s.declineCall);

  const visible = status === "incoming";
  const initial = peerUsername ? peerUsername[0].toUpperCase() : "?";

  useEffect(() => {
    if (visible) {
      Vibration.vibrate(VIBRATION_PATTERN, true);
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [visible]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={declineCall}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.75)",
        }}
      >
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 40,
            borderRadius: 28,
            backgroundColor: "#111",
            borderWidth: 1,
            borderColor: "#1f1f1f",
            overflow: "hidden",
          }}
        >
          {/* Top */}
          <View
            style={{
              alignItems: "center",
              paddingTop: 36,
              paddingBottom: 28,
              paddingHorizontal: 24,
              gap: 14,
            }}
          >
            <PulseAvatar initial={initial} />

            <View style={{ alignItems: "center", gap: 4 }}>
              <Text
                style={{
                  color: "#555",
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Incoming voice call
              </Text>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 26,
                  fontWeight: "600",
                  letterSpacing: -0.5,
                }}
              >
                {peerUsername}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: "#1a1a1a" }} />

          {/* Action buttons */}
          <View style={{ flexDirection: "row" }}>
            {/* Decline */}
            <Pressable
              onPress={declineCall}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingVertical: 24,
                gap: 10,
                backgroundColor: pressed ? "#1a0a0a" : "transparent",
              })}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#2a0f0f",
                  borderWidth: 1,
                  borderColor: "#3f1515",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="call"
                  size={24}
                  color="#ef4444"
                  style={{ transform: [{ rotate: "135deg" }] }}
                />
              </View>
              <Text
                style={{ color: "#ef4444", fontSize: 13, fontWeight: "500" }}
              >
                Decline
              </Text>
            </Pressable>

            {/* Vertical divider */}
            <View style={{ width: 1, backgroundColor: "#1a1a1a" }} />

            {/* Accept */}
            <Pressable
              onPress={acceptCall}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingVertical: 24,
                gap: 10,
                backgroundColor: pressed ? "#0a1a0a" : "transparent",
              })}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#0f2a0f",
                  borderWidth: 1,
                  borderColor: "#155015",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="call" size={24} color="#22c55e" />
              </View>
              <Text
                style={{ color: "#22c55e", fontSize: 13, fontWeight: "500" }}
              >
                Accept
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
