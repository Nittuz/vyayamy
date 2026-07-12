/**
 * On-device speech recognition adapter.
 *
 * Wraps expo-speech-recognition behind a small `SpeechEngine` interface so the
 * voice session hook never imports the native module directly — and so a cloud
 * fallback engine (Phase 2) can drop in behind the same interface. Native module;
 * not exercisable under ts-jest/Node — verified via on-device QA.
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
  start(onEvent: (e: SpeechEvent) => void, onError: (msg: string) => void): void;
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
      onError(e.message ?? String(e.error));
    });
    subscriptions = [resultSub, errorSub];

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
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
