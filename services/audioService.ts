import { File, Paths } from "expo-file-system";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  IOSOutputFormat,
  AudioQuality,
} from "expo-audio";
import type { RecordingOptions } from "expo-audio";

/** 32 kbps mono — good speech quality, ~480 KB for 2 minutes raw. */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 32000,
  },
};

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await getRecordingPermissionsAsync();
  if (granted) return true;
  const { granted: newGranted } = await requestRecordingPermissionsAsync();
  return newGranted;
}

/** Must be called before starting a recording on iOS. */
export async function enableRecordingMode(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
}

/** Restore normal playback mode after recording stops. */
export async function disableRecordingMode(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
}

/** Read an audio file as raw bytes for encryption. */
export async function readAudioFileAsBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  return file.bytes();
}

/** Write decrypted audio bytes to a temp cache file and return its URI. */
export function writeTempAudioFile(messageId: string, bytes: Uint8Array): string {
  const file = new File(Paths.cache, `voice_${messageId}.m4a`);
  file.write(bytes);
  return file.uri;
}

/** Delete a voice cache file. Safe to call with any URI — ignores missing files. */
export function deleteAudioFile(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    // File already gone — nothing to do
  }
}
