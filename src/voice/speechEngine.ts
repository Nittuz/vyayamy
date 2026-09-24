/**
 * Speech recognition adapter.
 *
 * Wraps expo-speech-recognition behind a small `SpeechEngine` interface so the
 * voice session hook never imports the native module directly. Recognition
 * runs on-device when the phone supports it for the language and falls back to
 * Apple's server recognition otherwise (owner decision, 2026-09-24: iOS 27 no
 * longer reports on-device support for the SFSpeechRecognizer path, and the
 * native library was already switching silently — now the choice is explicit
 * and the failure code reaches the card). Native module; not exercisable under
 * ts-jest/Node — verified via on-device QA.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface SpeechEvent {
  transcript: string;
  isFinal: boolean;
  /** 0..1, or -1 when the engine cannot report it; undefined on some partials. */
  confidence?: number;
}

export interface SpeechEngine {
  isAvailable(): boolean;
  requestPermissions(): Promise<boolean>;
  /** Error codes are expo-speech-recognition's web-speech names (see voiceErrors.ts). */
  start(onEvent: (e: SpeechEvent) => void, onError: (code: string, message?: string) => void): void;
  stop(): void;
}

let subscriptions: { remove: () => void }[] = [];

export const onDeviceEngine: SpeechEngine = {
  isAvailable() {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  },

  async requestPermissions() {
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted;
  },

  start(onEvent, onError) {
    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const best = e.results?.[0];
      if (best)
        onEvent({ transcript: best.transcript, isFinal: e.isFinal, confidence: best.confidence });
    });
    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (e) => {
      onError(String(e.error ?? ''), e.message);
    });
    subscriptions = [resultSub, errorSub];

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      // On-device when the phone supports it for this language; otherwise
      // Apple's server recognition (needs Siri & Dictation + a connection —
      // both surfaced by code through voiceErrorLabel when they are missing).
      requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      addsPunctuation: false,
    });
  },

  stop() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } finally {
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
    }
  },
};
