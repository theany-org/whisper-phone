import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuthStore } from "@/store/authStore";
import { useServerStore, DEFAULT_SERVER_URL } from "@/store/serverStore";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const { serverUrl, setServerUrl } = useServerStore();
  const [serverDraft, setServerDraft] = useState(serverUrl);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    clearError();
    try {
      await login(username.trim(), password);
      router.replace("/(chat)");
    } catch {
      // error state handled by store
    }
  };

  const handleSaveServer = async () => {
    await setServerUrl(serverDraft);
    setShowServer(false);
  };

  const isCustomServer = serverUrl !== DEFAULT_SERVER_URL;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-black justify-center px-8"
    >
      <View className="mb-12">
        <Text className="text-white text-4xl font-bold text-center">
          Whisper
        </Text>
        <Text className="text-neutral-500 text-center mt-2">
          End-to-end encrypted chat
        </Text>
      </View>

      {error && (
        <View className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 mb-4">
          <Text className="text-red-300 text-sm text-center">{error}</Text>
        </View>
      )}

      <TextInput
        className="bg-neutral-900 text-white px-4 py-4 rounded-xl mb-3 text-base border border-neutral-800"
        placeholder="Username"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />

      <View className="relative mb-6">
        <TextInput
          className="bg-neutral-900 text-white px-4 pr-12 py-4 rounded-xl text-base border border-neutral-800"
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          className="absolute right-4 top-0 bottom-0 items-center justify-center"
          hitSlop={8}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color="#9CA3AF"
          />
        </Pressable>
      </View>

      <Pressable
        onPress={handleLogin}
        disabled={isLoading}
        className="bg-blue-600 py-4 rounded-xl items-center active:bg-blue-700"
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-base">Sign In</Text>
        )}
      </Pressable>

      <View className="flex-row justify-center mt-6">
        <Text className="text-neutral-500">Don't have an account? </Text>
        <Link href="/(auth)/register" asChild>
          <Pressable>
            <Text className="text-blue-500 font-semibold">Register</Text>
          </Pressable>
        </Link>
      </View>

      {/* Server config toggle */}
      <Pressable
        onPress={() => {
          setServerDraft(serverUrl);
          setShowServer((v) => !v);
        }}
        className="flex-row items-center justify-center mt-8"
      >
        <Ionicons name="server-outline" size={14} color={isCustomServer ? "#3b82f6" : "#525252"} />
        <Text className={`text-xs ml-1.5 ${isCustomServer ? "text-blue-500" : "text-neutral-600"}`}>
          {isCustomServer ? serverUrl : "Custom server"}
        </Text>
      </Pressable>

      {showServer && (
        <View className="mt-3 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <Text className="text-neutral-400 text-xs mb-2">Server URL</Text>
          <TextInput
            className="bg-neutral-800 text-white px-4 py-3 rounded-lg text-sm border border-neutral-700"
            placeholder={DEFAULT_SERVER_URL}
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={serverDraft}
            onChangeText={setServerDraft}
          />
          <View className="flex-row justify-end mt-3 gap-2">
            <Pressable
              onPress={async () => {
                setServerDraft(DEFAULT_SERVER_URL);
                await setServerUrl("");
                setShowServer(false);
              }}
              className="px-4 py-2 rounded-lg active:bg-neutral-800"
            >
              <Text className="text-neutral-400 text-sm">Reset</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveServer}
              className="bg-blue-600 px-4 py-2 rounded-lg active:bg-blue-700"
            >
              <Text className="text-white text-sm font-medium">Save</Text>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
