import InCallManager from "react-native-incall-manager";
import { setAudioModeAsync } from "expo-audio";

/**
 * Activate audio mode for a live call.
 * Routes audio to earpiece by default (speaker can be toggled via setSpeaker).
 * Must be called after getUserMedia succeeds so the audio session is already open.
 */
export async function activateCallAudioSession(): Promise<void> {
  try {
    // expo-audio: allow recording + play through earpiece in silent mode
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    // react-native-incall-manager: switch to in-call audio mode (earpiece, echo cancellation)
    InCallManager.start({ media: "audio" });
  } catch (err) {
    console.warn("[AUDIO_SESSION] activateCallAudioSession failed", err);
  }
}

/**
 * Switch audio output between earpiece and loudspeaker during a call.
 */
export function setSpeaker(speakerOn: boolean): void {
  try {
    InCallManager.setSpeakerphoneOn(speakerOn);
  } catch (err) {
    console.warn("[AUDIO_SESSION] setSpeaker failed", err);
  }
}

/**
 * Restore normal playback audio mode after the call ends.
 */
export async function deactivateCallAudioSession(): Promise<void> {
  try {
    InCallManager.stop();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: false,
    });
  } catch (err) {
    console.warn("[AUDIO_SESSION] deactivateCallAudioSession failed", err);
  }
}
