import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer, AudioStatus } from "expo-audio";

import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { checkUserExists } from "@/services/api";
import MessageBubble from "@/components/MessageBubble";
import VoiceRecorder from "@/components/VoiceRecorder";
import type { ChatMessage } from "@/types";

const EMPTY_MESSAGES: ChatMessage[] = [];
const REPLY_PREVIEW_MAX = 120;

export default function ChatScreen() {
  const { username: recipient } = useLocalSearchParams<{ username: string }>();
  const myUsername = useAuthStore((s) => s.username)!;
  const messages = useChatStore(
    (s) => s.messages[recipient ?? ""] ?? EMPTY_MESSAGES,
  );
  const send = useChatStore((s) => s.send);
  const sendVoice = useChatStore((s) => s.sendVoice);
  const ensureConversation = useChatStore((s) => s.ensureConversation);
  const setActivePeer = useChatStore((s) => s.setActivePeer);
  const clearActivePeer = useChatStore((s) => s.clearActivePeer);
  const [text, setText] = useState("");
  const [online, setOnline] = useState(false);
  const [contextMsg, setContextMsg] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playCurrentTime, setPlayCurrentTime] = useState(0);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const playerSubRef = useRef<{ remove(): void } | null>(null);

  useEffect(() => {
    if (recipient) ensureConversation(recipient);
  }, [ensureConversation, recipient]);

  // Suppress notifications for this peer while the screen is focused
  useFocusEffect(
    useCallback(() => {
      if (recipient) setActivePeer(recipient);
      return () => clearActivePeer();
    }, [recipient, setActivePeer, clearActivePeer])
  );

  // Poll online status
  useEffect(() => {
    if (!recipient) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await checkUserExists(recipient);
        if (active) setOnline(res.online);
      } catch {
        if (active) setOnline(false);
      }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [recipient]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Clean up audio player on unmount
  useEffect(() => {
    return () => {
      playerSubRef.current?.remove();
      playerRef.current?.remove();
    };
  }, []);

  const handlePlayPauseVoice = (msg: ChatMessage) => {
    if (!msg.audioUri) return;

    if (playingId === msg.id) {
      if (playerRef.current?.playing) {
        playerRef.current.pause();
      } else {
        playerRef.current?.play();
      }
      return;
    }

    // Stop current player and start a new one
    playerSubRef.current?.remove();
    playerRef.current?.remove();
    playerRef.current = null;
    setPlayingId(msg.id);
    setPlayCurrentTime(0);

    const player = createAudioPlayer({ uri: msg.audioUri }, { updateInterval: 200 });
    playerRef.current = player;

    playerSubRef.current = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
        setPlayCurrentTime(status.currentTime);
        if (status.didJustFinish) {
          setPlayingId(null);
          setPlayCurrentTime(0);
          playerSubRef.current?.remove();
          playerRef.current?.remove();
          playerRef.current = null;
        }
      }
    );

    player.play();
  };

  const handleSendVoice = async (uri: string, duration: number) => {
    setShowRecorder(false);
    if (!recipient) return;
    await sendVoice(myUsername, recipient, uri, duration);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !recipient) return;
    const replySnapshot = replyingTo
      ? {
          id: replyingTo.id,
          text: replyingTo.type === "voice"
            ? "🎤 Voice message"
            : replyingTo.text.slice(0, REPLY_PREVIEW_MAX),
          from: replyingTo.from,
        }
      : undefined;
    setText("");
    setReplyingTo(null);
    await send(myUsername, recipient, trimmed, replySnapshot);
  };

  const closeContextMenu = () => setContextMsg(null);

  const handleCopyMessage = async () => {
    if (!contextMsg) return;
    await Clipboard.setStringAsync(contextMsg.text);
    if (Platform.OS === "android") {
      ToastAndroid.show("Copied", ToastAndroid.SHORT);
    }
    closeContextMenu();
  };

  const handleReplyFromMenu = () => {
    if (!contextMsg) return;
    setReplyingTo(contextMsg);
    closeContextMenu();
  };

  const contextTime = contextMsg
    ? new Date(contextMsg.timestamp * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const contextSender = contextMsg
    ? contextMsg.isMine
      ? "You"
      : contextMsg.from
    : "";

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-black"
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: recipient ?? "",
          headerBackTitle: "Back",
          headerRight: () => (
            <View className="flex-row items-center mr-2">
              <View
                className={`w-2.5 h-2.5 rounded-full mr-1.5 ${
                  online ? "bg-green-500" : "bg-neutral-600"
                }`}
              />
              <Text className="text-neutral-400 text-xs">
                {online ? "Online" : "Offline"}
              </Text>
            </View>
          ),
        }}
      />

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            onLongPress={(msg) => setContextMsg(msg)}
            onReply={(msg) => setReplyingTo(msg)}
            isPlayingVoice={playingId === item.id}
            voiceCurrentTime={playingId === item.id ? playCurrentTime : 0}
            onPlayPauseVoice={handlePlayPauseVoice}
          />
        )}
        contentContainerStyle={{
          padding: 16,
          flexGrow: 1,
          justifyContent: "flex-end",
        }}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Reply preview bar */}
      {replyingTo && (
        <View className="flex-row items-center px-4 py-2 border-t border-neutral-800 bg-neutral-950 gap-3">
          <View className="flex-1 border-l-2 border-blue-500 pl-2">
            <Text className="text-blue-400 text-[11px] font-semibold mb-0.5">
              {replyingTo.isMine ? "You" : replyingTo.from}
            </Text>
            <Text className="text-neutral-400 text-[12px]" numberOfLines={1}>
              {replyingTo.type === "voice" ? "🎤 Voice message" : replyingTo.text}
            </Text>
          </View>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Text className="text-neutral-500 text-lg leading-none">✕</Text>
          </Pressable>
        </View>
      )}

      {/* Input bar / Voice recorder */}
      {showRecorder ? (
        <VoiceRecorder
          onSend={handleSendVoice}
          onCancel={() => setShowRecorder(false)}
        />
      ) : (
        <View className="flex-row items-end px-4 py-3 border-t border-neutral-900 gap-2">
          <TextInput
            className="flex-1 bg-neutral-900 text-white px-4 py-3 rounded-2xl text-base border border-neutral-800 max-h-28"
            placeholder="Message..."
            placeholderTextColor="#666"
            multiline
            value={text}
            onChangeText={setText}
          />
          {text.trim() ? (
            <Pressable
              onPress={handleSend}
              className="w-10 h-10 rounded-full items-center justify-center bg-blue-600 active:bg-blue-700"
            >
              <Text className="text-white font-bold text-lg">↑</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setShowRecorder(true)}
              className="w-10 h-10 rounded-full items-center justify-center bg-neutral-800 active:bg-neutral-700"
            >
              <Ionicons name="mic" size={20} color="#aaa" />
            </Pressable>
          )}
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(contextMsg)}
        onRequestClose={closeContextMenu}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable onPress={closeContextMenu} className="absolute inset-0" />

          <View
            className="mx-4 mb-5 rounded-[26px] border border-neutral-800 bg-neutral-950 overflow-hidden"
            style={{
              elevation: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.32,
              shadowRadius: 20,
            }}
          >
            <View className="px-4 pt-4 pb-3">
              {contextMsg && (
                <View
                  className={`rounded-2xl px-4 py-3 border ${
                    contextMsg.isMine
                      ? "bg-blue-600/14 border-blue-400/20"
                      : "bg-neutral-900 border-neutral-800"
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-2 h-2 rounded-full ${
                          contextMsg.isMine ? "bg-blue-400" : "bg-neutral-500"
                        }`}
                      />
                      <Text
                        className={`text-xs font-semibold ${
                          contextMsg.isMine
                            ? "text-blue-200"
                            : "text-neutral-400"
                        }`}
                      >
                        {contextSender}
                      </Text>
                    </View>
                    <View className="px-2 py-1 rounded-full bg-black/20 border border-white/5">
                      <Text className="text-[10px] font-medium text-neutral-400">
                        {contextTime}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className="text-white text-[15px] leading-5"
                    numberOfLines={4}
                  >
                    {contextMsg.text}
                  </Text>
                </View>
              )}
            </View>

            <View className="px-4 pb-4">
              <View className="flex-row rounded-[22px] border border-neutral-800 bg-neutral-900 overflow-hidden">
                <Pressable
                  onPress={handleReplyFromMenu}
                  className="flex-1 flex-row items-center justify-center gap-2 py-4 bg-blue-500/10 active:bg-blue-500/16"
                >
                  <View className="w-8 h-8 rounded-full items-center justify-center bg-blue-500/18 border border-blue-300/15">
                    <Ionicons name="arrow-undo" size={16} color="#93c5fd" />
                  </View>
                  <Text className="text-[15px] font-semibold text-blue-100">
                    Reply
                  </Text>
                </Pressable>

                {contextMsg?.type !== "voice" && (
                  <>
                    <View className="w-px bg-neutral-800" />
                    <Pressable
                      onPress={handleCopyMessage}
                      className="flex-1 flex-row items-center justify-center gap-2 py-4 active:bg-neutral-800"
                    >
                      <View className="w-8 h-8 rounded-full items-center justify-center bg-neutral-800 border border-neutral-700">
                        <Ionicons name="copy-outline" size={16} color="#e5e5e5" />
                      </View>
                      <Text className="text-[15px] font-semibold text-white">
                        Copy
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
