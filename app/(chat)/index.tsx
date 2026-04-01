import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";

import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { usePresenceStore } from "@/store/presenceStore";
import { setStatusHandler } from "@/services/socket";
import { checkUserExists } from "@/services/api";
import type { Conversation } from "@/types";

export default function ConversationsScreen() {
  const { username, logout } = useAuthStore();
  const {
    conversations,
    connected,
    initSocket,
    setConnected,
    ensureConversation,
  } = useChatStore();
  const [newChat, setNewChat] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (username) {
      initSocket(username);
      const unsub = setStatusHandler(setConnected);
      return unsub;
    }
  }, [username]);

  const startChat = async () => {
    const target = newChat.trim().toLowerCase();
    if (!target) return;
    if (target === username) {
      Alert.alert("Error", "You cannot chat with yourself");
      return;
    }

    setChecking(true);
    try {
      await checkUserExists(target);
      ensureConversation(target);
      setNewChat("");
      router.push(`/(chat)/${target}`);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        Alert.alert("User not found", `"${target}" does not exist.`);
      } else {
        Alert.alert("Connection error", "Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setChecking(false);
    }
  };

  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const renderConversation = ({ item }: { item: Conversation }) => {
    const time = item.lastTimestamp
      ? new Date(item.lastTimestamp * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const isOnline = onlineUsers.has(item.username);

    return (
      <Pressable
        onPress={() => router.push(`/(chat)/${item.username}`)}
        className="flex-row items-center px-4 py-4 border-b border-neutral-900 active:bg-neutral-900"
      >
        <View className="w-11 h-11 mr-3">
          <View className="w-11 h-11 rounded-full bg-blue-600 items-center justify-center">
            <Text className="text-white font-bold text-lg">
              {item.username[0].toUpperCase()}
            </Text>
          </View>
          {isOnline && (
            <View className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-black" />
          )}
        </View>
        <View className="flex-1">
          <View className="flex-row justify-between items-center">
            <Text className="text-white font-semibold text-base">
              {item.username}
            </Text>
            <Text className="text-neutral-500 text-xs">{time}</Text>
          </View>
          {item.lastMessage ? (
            <Text className="text-neutral-400 text-sm mt-0.5" numberOfLines={1}>
              {item.lastMessage}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      {/* Header */}
      <View className="px-4 pt-14 pb-3 border-b border-neutral-900">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-white text-2xl font-bold">Whisper</Text>
            <View className="flex-row items-center mt-1">
              <View
                className={`w-2 h-2 rounded-full mr-1.5 ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <Text className="text-neutral-500 text-xs">
                {connected ? "Connected" : "Reconnecting..."}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => router.push("/(chat)/settings")}
              className="bg-neutral-900 px-4 py-2 rounded-lg active:bg-neutral-800"
            >
              <Text className="text-neutral-400 text-sm font-medium">⚙</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert("Logout", "Are you sure you want to log out?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Logout", style: "destructive", onPress: logout },
                ])
              }
              className="bg-neutral-900 px-4 py-2 rounded-lg active:bg-neutral-800"
            >
              <Text className="text-red-400 text-sm font-medium">Logout</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* New chat input */}
      <View className="flex-row px-4 py-3 gap-2 border-b border-neutral-900">
        <TextInput
          className="flex-1 bg-neutral-900 text-white px-4 py-3 rounded-xl text-sm border border-neutral-800"
          placeholder="Enter username to chat..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          value={newChat}
          onChangeText={setNewChat}
          onSubmitEditing={startChat}
          returnKeyType="go"
          editable={!checking}
        />
        <Pressable
          onPress={startChat}
          disabled={checking}
          className="bg-blue-600 px-5 rounded-xl items-center justify-center active:bg-blue-700"
        >
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-semibold text-sm">Chat</Text>
          )}
        </Pressable>
      </View>

      {/* Conversation list */}
      {conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-neutral-600 text-center text-base">
            No conversations yet.{"\n"}Enter a username above to start chatting.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.username}
          renderItem={renderConversation}
        />
      )}
    </View>
  );
}
