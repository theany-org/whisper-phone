import { useRef } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";
import type { ChatMessage } from "@/types";

interface Props {
  message: ChatMessage;
  onLongPressMessage?: (text: string) => void;
}

export default function MessageBubble({ message, onLongPressMessage }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const time = new Date(message.timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleLongPress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 180,
      }),
    ]).start();
    onLongPressMessage?.(message.text);
  };

  return (
    <Pressable
      onLongPress={handleLongPress}
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.98,
          useNativeDriver: true,
          friction: 8,
          tension: 220,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 220,
        }).start();
      }}
      delayLongPress={250}
      className={`max-w-[80%] mb-2 ${
        message.isMine
          ? "self-end"
          : "self-start"
      }`}
    >
      <Animated.View
        style={{ transform: [{ scale }] }}
        className={`px-4 py-2 rounded-2xl ${
          message.isMine
            ? "bg-blue-600 rounded-br-sm"
            : "bg-neutral-800 rounded-bl-sm"
        }`}
      >
        <Text className="text-white text-[15px] leading-5">
          {message.text}
        </Text>
        <View className="flex-row items-center justify-end mt-1 gap-1">
          <Text className="text-[11px] text-neutral-400">{time}</Text>
          {message.isMine && (
            <Text className="text-[11px] text-neutral-400">
              {message.status === "sending"
                ? "..."
                : message.status === "failed"
                  ? "!"
                  : "✓"}
            </Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
