import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  OverKeyboardView,
} from "react-native-keyboard-controller";

import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { checkUserExists } from "@/services/api";
import MessageBubble from "@/components/MessageBubble";
import type { ChatMessage } from "@/types";

const EMPTY_MESSAGES: ChatMessage[] = [];

export default function ChatScreen() {
  const { username: recipient } = useLocalSearchParams<{ username: string }>();
  const myUsername = useAuthStore((s) => s.username)!;
  const messages = useChatStore(
    (s) => s.messages[recipient ?? ""] ?? EMPTY_MESSAGES,
  );
  const send = useChatStore((s) => s.send);
  const ensureConversation = useChatStore((s) => s.ensureConversation);
  const [text, setText] = useState("");
  const [online, setOnline] = useState(false);
  const [contextText, setContextText] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (recipient) ensureConversation(recipient);
  }, [recipient]);

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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !recipient) return;
    setText("");
    await send(myUsername, recipient, trimmed);
  };

  const closeContextMenu = () => setContextText(null);

  const handleCopyMessage = async () => {
    if (!contextText) return;
    await Clipboard.setStringAsync(contextText);
    if (Platform.OS === "android") {
      ToastAndroid.show("Copied", ToastAndroid.SHORT);
    }
    closeContextMenu();
  };

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
            onLongPressMessage={(value) => setContextText(value)}
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

      {/* Input bar */}
      <View className="flex-row items-end px-4 py-3 border-t border-neutral-900 gap-2">
        <TextInput
          className="flex-1 bg-neutral-900 text-white px-4 py-3 rounded-2xl text-base border border-neutral-800 max-h-28"
          placeholder="Message..."
          placeholderTextColor="#666"
          multiline
          value={text}
          onChangeText={setText}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim()}
          className={`w-10 h-10 rounded-full items-center justify-center ${
            text.trim() ? "bg-blue-600 active:bg-blue-700" : "bg-neutral-800"
          }`}
        >
          <Text className="text-white font-bold text-lg">↑</Text>
        </Pressable>
      </View>

      <OverKeyboardView visible={Boolean(contextText)}>
        <Pressable
          onPress={closeContextMenu}
          className="flex-1 justify-end bg-black/40"
        >
          <Pressable
            onPress={handleCopyMessage}
            className="mx-4 mb-5 rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-4"
          >
            <Text className="text-white text-base font-medium">Copy</Text>
          </Pressable>
        </Pressable>
      </OverKeyboardView>
    </KeyboardAvoidingView>
  );
}
