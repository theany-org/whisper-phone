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

export default function RegisterScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { register, isLoading, error, clearError } = useAuthStore();

  const handleRegister = async () => {
    setLocalError(null);
    clearError();

    const u = username.trim();
    const p = password;

    if (!u || !p || !confirm) {
      setLocalError("All fields are required");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(u)) {
      setLocalError("Username: 3-32 chars, letters/digits/underscores only");
      return;
    }
    if (p.length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }
    if (p !== confirm) {
      setLocalError("Passwords do not match");
      return;
    }

    try {
      await register(u, p);
      router.replace("/(chat)");
    } catch (err) {
      // API errors are displayed via store.error — log unexpected ones in dev
      if (__DEV__) console.error("[REGISTER] unexpected error", err);
    }
  };

  const displayError = localError ?? error;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-black justify-center px-8"
    >
      <View className="mb-12">
        <Text className="text-white text-4xl font-bold text-center">
          Create Account
        </Text>
        <Text className="text-neutral-500 text-center mt-2">
          Your keys are generated on-device
        </Text>
      </View>

      {displayError && (
        <View className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 mb-4">
          <Text className="text-red-300 text-sm text-center">
            {displayError}
          </Text>
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

      <View className="relative mb-3">
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

      <View className="relative mb-6">
        <TextInput
          className="bg-neutral-900 text-white px-4 pr-12 py-4 rounded-xl text-base border border-neutral-800"
          placeholder="Confirm Password"
          placeholderTextColor="#666"
          secureTextEntry={!showConfirmPassword}
          value={confirm}
          onChangeText={setConfirm}
        />
        <Pressable
          onPress={() => setShowConfirmPassword((v) => !v)}
          className="absolute right-4 top-0 bottom-0 items-center justify-center"
          hitSlop={8}
        >
          <Ionicons
            name={showConfirmPassword ? "eye-off" : "eye"}
            size={20}
            color="#9CA3AF"
          />
        </Pressable>
      </View>

      <Pressable
        onPress={handleRegister}
        disabled={isLoading}
        className="bg-blue-600 py-4 rounded-xl items-center active:bg-blue-700"
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-base">
            Create Account
          </Text>
        )}
      </Pressable>

      <View className="flex-row justify-center mt-6">
        <Text className="text-neutral-500">Already have an account? </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable>
            <Text className="text-blue-500 font-semibold">Sign In</Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
