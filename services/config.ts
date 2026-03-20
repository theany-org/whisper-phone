import { getUrls } from "@/store/serverStore";

/** Base URL for HTTP API requests (reads from serverStore). */
export function getApiBaseUrl(): string {
  return getUrls().apiBaseUrl;
}

/** Base URL for WebSocket connections (reads from serverStore). */
export function getWsBaseUrl(): string {
  return getUrls().wsBaseUrl;
}
