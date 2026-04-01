import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";

import { useCallStore } from "@/store/callStore";
import * as callWebrtc from "@/services/callWebrtc";
import { setSpeaker } from "@/services/audioSession";
import { fetchTurnCredentials } from "@/services/api";
import { sendSignal } from "@/services/socket";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getInitial(name: string): string {
  return name ? name[0].toUpperCase() : "?";
}

// Pulsing ring around the avatar while calling/connecting
function PulseRing({ active }: { active: boolean }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 1000, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1000 }),
          withTiming(0.5, { duration: 800 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1);
      opacity.value = withTiming(0);
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 2,
          borderColor: "#22c55e",
        },
      ]}
    />
  );
}

// Control button — circular with label below
function CallButton({
  icon,
  label,
  onPress,
  active = false,
  color = "#fff",
  bg = "#1f1f1f",
  activeBg = "#fff",
  activeColor = "#000",
  disabled = false,
  size = 56,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  color?: string;
  bg?: string;
  activeBg?: string;
  activeColor?: string;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active ? activeBg : pressed ? "#2a2a2a" : bg,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.35 : 1,
          borderWidth: 1,
          borderColor: active ? "transparent" : "#2e2e2e",
        })}
      >
        <Ionicons
          name={icon}
          size={size * 0.42}
          color={active ? activeColor : color}
        />
      </Pressable>
      <Text style={{ color: "#666", fontSize: 11, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

export default function CallScreen() {
  const { username: peerUsername } = useLocalSearchParams<{
    username: string;
  }>();

  const status = useCallStore((s) => s.status);
  const isMuted = useCallStore((s) => s.isMuted);
  const isSpeakerOn = useCallStore((s) => s.isSpeakerOn);
  const incomingOffer = useCallStore((s) => s.incomingOffer);
  const setMuted = useCallStore((s) => s.setMuted);
  const setSpeakerOn = useCallStore((s) => s.setSpeaker);
  const setStatus = useCallStore((s) => s.setStatus);
  const endCall = useCallStore((s) => s.endCall);

  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setupDoneRef = useRef(false);

  // Duration timer
  useEffect(() => {
    if (status === "active") {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Navigate back when call ends
  useEffect(() => {
    if (status === "idle") router.back();
  }, [status]);

  // WebRTC setup — runs once on mount
  useEffect(() => {
    if (setupDoneRef.current) return;
    setupDoneRef.current = true;

    async function setup() {
      try {
        let iceServers: {
          urls: string[];
          username?: string;
          credential?: string;
        }[] = [];
        try {
          const turnCreds = await fetchTurnCredentials();
          if (turnCreds.urls?.length) {
            iceServers = [
              {
                urls: turnCreds.urls,
                username: turnCreds.username,
                credential: turnCreds.credential,
              },
            ];
          }
        } catch {
          console.warn("[CALL_SCREEN] TURN fetch failed — using direct P2P");
        }

        callWebrtc.initPeerConnection(iceServers);
        await callWebrtc.attachLocalAudio();

        const currentStatus = useCallStore.getState().status;
        const currentCallId = useCallStore.getState().callId;

        if (currentStatus === "outgoing") {
          const offer = await callWebrtc.createOffer();
          sendSignal({
            type: "call_offer",
            call_id: currentCallId!,
            to: peerUsername!,
            sdp: offer,
          });
        } else if (currentStatus === "connecting" && incomingOffer) {
          const answer = await callWebrtc.createAnswer(incomingOffer);
          sendSignal({
            type: "call_answer",
            call_id: currentCallId!,
            to: peerUsername!,
            sdp: answer,
          });
          setStatus("active");
        }
      } catch (err) {
        console.error("[CALL_SCREEN] setup failed", err);
        const msg = err instanceof Error ? err.message : "";
        const isMicDenied =
          msg.toLowerCase().includes("permission") ||
          msg.toLowerCase().includes("denied") ||
          msg.toLowerCase().includes("notallowed");
        Alert.alert(
          "Call failed",
          isMicDenied
            ? "Microphone permission denied. Please allow microphone access in your device settings."
            : "Could not start the call. Please try again.",
        );
        endCall();
      }
    }

    setup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleSpeaker = (v: boolean) => {
    setSpeaker(v);
    setSpeakerOn(v);
  };

  const isPulsing = status === "outgoing" || status === "connecting";

  const statusLabel = () => {
    switch (status) {
      case "outgoing":   return "Calling…";
      case "incoming":   return "Incoming call";
      case "connecting": return "Connecting…";
      default:           return "";
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {/* Subtle background glow */}
      <View
        style={{
          position: "absolute",
          top: -80,
          left: "50%",
          marginLeft: -160,
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: status === "active" ? "#14532d" : "#1a1a1a",
          opacity: 0.35,
        }}
      />

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 48,
          paddingHorizontal: 24,
        }}
      >
        {/* ── Top status (hidden when active) ── */}
        <Text
          style={{
            color: "#666",
            fontSize: 13,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {statusLabel()}
        </Text>

        {/* ── Avatar ── */}
        <View style={{ alignItems: "center", gap: 20 }}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <PulseRing active={isPulsing} />
            <View
              style={{
                width: 112,
                height: 112,
                borderRadius: 56,
                backgroundColor: "#1a2e1a",
                borderWidth: 2,
                borderColor: "#22c55e22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#22c55e",
                  fontSize: 44,
                  fontWeight: "300",
                  letterSpacing: -1,
                }}
              >
                {getInitial(peerUsername ?? "")}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 30,
                fontWeight: "600",
                letterSpacing: -0.5,
              }}
            >
              {peerUsername}
            </Text>
            {status === "active" && (
              <View style={{ alignItems: "center", gap: 6 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "#22c55e",
                    }}
                  />
                  <Text style={{ color: "#22c55e", fontSize: 13 }}>
                    Connected
                  </Text>
                </View>
                <Text style={{ color: "#555", fontSize: 13, letterSpacing: 0.5 }}>
                  {formatDuration(duration)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Controls ── */}
        <View style={{ width: "100%", gap: 32 }}>
          {/* Secondary controls row */}
          <View
            style={{ flexDirection: "row", justifyContent: "center", gap: 28 }}
          >
            <CallButton
              icon={isMuted ? "mic-off" : "mic"}
              label={isMuted ? "Unmute" : "Mute"}
              onPress={() => setMuted(!isMuted)}
              active={isMuted}
              disabled={status !== "active"}
            />
            <CallButton
              icon={isSpeakerOn ? "volume-high" : "volume-medium"}
              label={isSpeakerOn ? "Earpiece" : "Speaker"}
              onPress={() => handleToggleSpeaker(!isSpeakerOn)}
              active={isSpeakerOn}
              disabled={status !== "active"}
            />
          </View>

          {/* End call button */}
          <View style={{ alignItems: "center" }}>
            <Pressable
              onPress={endCall}
              style={({ pressed }) => ({
                width: 70,
                height: 70,
                borderRadius: 35,
                backgroundColor: pressed ? "#b91c1c" : "#ef4444",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#ef4444",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 8,
              })}
            >
              <Ionicons
                name="call"
                size={28}
                color="white"
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
