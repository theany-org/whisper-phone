import axios, { AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";

import { getApiBaseUrl } from "./config";
import type { PublicKeyResponse, TokenResponse } from "@/types";

const TOKEN_SLOT = "whisper_jwt";

const client = axios.create({
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Set baseURL dynamically + attach JWT on every request
client.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl();
  const token = await SecureStore.getItemAsync(TOKEN_SLOT);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Token helpers ───────────────────────────────────────────────────

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_SLOT, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_SLOT);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_SLOT);
}

// ── Auth endpoints ──────────────────────────────────────────────────

export async function register(
  username: string,
  password: string,
  publicKey: string
): Promise<void> {
  await client.post("/auth/register", {
    username,
    password,
    public_key: publicKey,
  });
}

export async function login(
  username: string,
  password: string
): Promise<string> {
  const { data } = await client.post<TokenResponse>("/auth/login", {
    username,
    password,
  });
  await storeToken(data.access_token);
  return data.access_token;
}

// ── User endpoints ──────────────────────────────────────────────────

export async function fetchPublicKey(
  username: string
): Promise<string> {
  const { data } = await client.get<PublicKeyResponse>(
    `/users/${encodeURIComponent(username)}/public-key`
  );
  return data.public_key;
}

export async function updatePublicKey(publicKey: string): Promise<void> {
  await client.put("/users/me/public-key", { public_key: publicKey });
}

export async function fetchWsTicket(): Promise<string> {
  const { data } = await client.post<{ ticket: string }>("/auth/ws-ticket");
  return data.ticket;
}

export async function logout(): Promise<void> {
  try {
    await client.post("/auth/logout");
  } catch {
    // Best-effort — clear local state regardless
  }
}

export async function checkUserExists(
  username: string
): Promise<{ username: string; online: boolean }> {
  const { data } = await client.get<{ username: string; online: boolean }>(
    `/users/${encodeURIComponent(username)}/exists`
  );
  return data;
}

// ── Error helper ────────────────────────────────────────────────────

export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unknown error occurred";
}
