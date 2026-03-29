import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import type { ChatMessage } from "@/types";

const SWIPE_THRESHOLD = 65;
const MAX_TRANSLATE = 80;
const ICON_REVEAL_DISTANCE = 18;

// bg-blue-600 / bg-neutral-800 equivalents
const BG_MINE_NORMAL = "#2563eb";
const BG_MINE_ACTIVE = "#3b82f6"; // blue-500 — subtle highlight at threshold
const BG_THEIRS_NORMAL = "#262626";
const BG_THEIRS_ACTIVE = "#404040"; // neutral-700

interface Props {
  message: ChatMessage;
  onLongPress?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage) => void;
}

export default function MessageBubble({
  message,
  onLongPress,
  onReply,
}: Props) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const hasTriggered = useSharedValue(false);

  const time = new Date(message.timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const triggerReply = () => onReply?.(message);
  const triggerHaptic = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const triggerLongPress = () => onLongPress?.(message);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      hasTriggered.value = false;
    })
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = Math.max(e.translationX * 0.5, -MAX_TRANSLATE);
        if (e.translationX < -SWIPE_THRESHOLD && !hasTriggered.value) {
          hasTriggered.value = true;
          scheduleOnRN(triggerHaptic);
        } else if (e.translationX >= -SWIPE_THRESHOLD && hasTriggered.value) {
          hasTriggered.value = false;
        }
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        scheduleOnRN(triggerReply);
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      hasTriggered.value = false;
    });

  const normalBg = message.isMine ? BG_MINE_NORMAL : BG_THEIRS_NORMAL;
  const activeBg = message.isMine ? BG_MINE_ACTIVE : BG_THEIRS_ACTIVE;

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: translateX.value }],
    backgroundColor: interpolateColor(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [activeBg, normalBg],
    ),
  }));

  const replyIconStyle = useAnimatedStyle(() => {
    const swipe = -translateX.value;
    const progress = interpolate(
      swipe,
      [0, ICON_REVEAL_DISTANCE, SWIPE_THRESHOLD],
      [0, 0.55, 1],
      "clamp",
    );

    return {
      opacity: progress,
      width: interpolate(progress, [0, 1], [34, 72]),
      transform: [
        { translateX: interpolate(progress, [0, 1], [14, -2]) },
        { scale: interpolate(progress, [0, 1], [0.88, 1]) },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{
          alignSelf: message.isMine ? "flex-end" : "flex-start",
          marginBottom: 8,
          maxWidth: "80%",
          position: "relative",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            replyIconStyle,
            {
              alignItems: "center",
              backgroundColor: "rgba(37,99,235,0.22)",
              borderColor: "rgba(147,197,253,0.42)",
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 6,
              height: 34,
              justifyContent: "flex-start",
              overflow: "hidden",
              paddingHorizontal: 10,
              position: "absolute",
              right: -50,
              shadowColor: "#2563eb",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.24,
              shadowRadius: 12,
              top: "50%",
              marginTop: -17,
            },
          ]}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.12)",
              borderRadius: 999,
              height: 20,
              justifyContent: "center",
              width: 20,
            }}
          >
            <Ionicons name="arrow-undo" size={12} color="#dbeafe" />
          </View>
          <Text
            style={{
              color: "#dbeafe",
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 0.2,
            }}
          >
            Reply
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            bubbleStyle,
            {
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 18,
              borderBottomRightRadius: message.isMine ? 4 : 18,
              borderBottomLeftRadius: message.isMine ? 18 : 4,
            },
          ]}
        >
          <Pressable
            onLongPress={() => {
              scale.value = withSequence(
                withTiming(0.95, { duration: 70 }),
                withSpring(1, { damping: 7, stiffness: 180 }),
              );
              triggerLongPress();
            }}
            onPressIn={() => {
              scale.value = withSpring(0.98, { damping: 8, stiffness: 220 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 8, stiffness: 220 });
            }}
            delayLongPress={250}
          >
            {message.replyTo && (
              <View
                style={{
                  marginBottom: 8,
                  paddingLeft: 10,
                  paddingRight: 4,
                  paddingVertical: 4,
                  borderRadius: 8,
                  borderLeftWidth: 2,
                  backgroundColor: message.isMine
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.07)",
                  borderLeftColor: message.isMine
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(96,165,250,0.65)",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: message.isMine
                      ? "rgba(255,255,255,0.85)"
                      : "#60a5fa",
                    marginBottom: 2,
                  }}
                >
                  {message.replyTo.from}
                </Text>
                <Text
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}
                  numberOfLines={2}
                >
                  {message.replyTo.text}
                </Text>
              </View>
            )}

            <Text className="text-white text-[15px] leading-5">
              {message.text}
            </Text>

            <View className="flex-row items-center justify-end mt-1 gap-1">
              <Text className="text-[11px] text-white/50">{time}</Text>
              {message.isMine && (
                <Text className="text-[11px] text-white/50">
                  {message.status === "sending"
                    ? "..."
                    : message.status === "failed"
                      ? "!"
                      : "✓"}
                </Text>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
