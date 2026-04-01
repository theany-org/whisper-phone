import { useCallback, useEffect, useRef } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAudioRecorder, useAudioRecorderState } from "expo-audio";

import {
  VOICE_RECORDING_OPTIONS,
  requestMicPermission,
  enableRecordingMode,
  disableRecordingMode,
} from "@/services/audioService";
import { formatDuration } from "@/utils/formatDuration";

const MAX_DURATION_S = 120; // 2 minutes

interface Props {
  onSend: (uri: string, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onSend, onCancel }: Props) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 200);
  const startedRef = useRef(false);
  // Track duration via ref so stopAndSend always has the latest value.
  // state.durationMillis is always in ms on both iOS and Android —
  // recorder.currentTime returns ms on Android but s on iOS, so we avoid it.
  const durationMsRef = useRef(0);

  const elapsedS = Math.floor(state.durationMillis / 1000);

  useEffect(() => {
    durationMsRef.current = state.durationMillis;
  }, [state.durationMillis]);
  const nearEnd = MAX_DURATION_S - elapsedS <= 30;

  // Pulsing red dot
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1
    );
  }, [opacity]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const stopAndSend = useCallback(async () => {
    if (!startedRef.current) return;
    startedRef.current = false;
    const durationS = Math.max(1, Math.ceil(durationMsRef.current / 1000));
    await recorder.stop();
    await disableRecordingMode();
    const uri = recorder.uri;
    if (uri) {
      onSend(uri, durationS);
    } else {
      onCancel();
    }
  }, [recorder, onSend, onCancel]);

  const stopAndCancel = useCallback(async () => {
    if (startedRef.current) {
      startedRef.current = false;
      await recorder.stop();
      await disableRecordingMode();
    }
    onCancel();
  }, [recorder, onCancel]);

  // Auto-stop at 2 minutes
  useEffect(() => {
    if (elapsedS >= MAX_DURATION_S && startedRef.current) {
      stopAndSend();
    }
  }, [elapsedS, stopAndSend]);

  // Start recording on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await requestMicPermission();
      if (!granted || cancelled) {
        if (!cancelled) {
          Alert.alert(
            "Permission required",
            "Microphone access is needed to send voice messages."
          );
          onCancel();
        }
        return;
      }
      await enableRecordingMode();
      await recorder.prepareToRecordAsync();
      if (cancelled) return;
      recorder.record();
      startedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: "#171717",
        gap: 12,
      }}
    >
      <Pressable
        onPress={stopAndCancel}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#262626",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" size={20} color="#aaa" />
      </Pressable>

      {/* Recording indicator */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#111",
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <Animated.View
          style={[
            dotStyle,
            { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
          ]}
        />
        <Text style={{ color: "#fff", fontVariant: ["tabular-nums"], fontSize: 16, fontWeight: "500" }}>
          {formatDuration(elapsedS)}
        </Text>
        {nearEnd && (
          <Text style={{ color: "#f97316", fontSize: 12, marginLeft: "auto" }}>
            {MAX_DURATION_S - elapsedS}s left
          </Text>
        )}
      </View>

      <Pressable
        onPress={stopAndSend}
        disabled={elapsedS < 1}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: elapsedS >= 1 ? "#2563eb" : "#262626",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="checkmark" size={22} color={elapsedS >= 1 ? "#fff" : "#555"} />
      </Pressable>
    </View>
  );
}
