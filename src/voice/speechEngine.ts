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

import { LateFinalTracker } from './lateFinal';

export interface SpeechEvent {
  transcript: string;
  isFinal: boolean;
  /** 0..1, or -1 when the engine cannot report it; undefined on some partials. */
  confidence?: number;
}

export interface SpeechEngine {
  isAvailable(): boolean;
  requestPermissions(): Promise<boolean>;
  /**
   * Error codes are expo-speech-recognition's web-speech names (see
   * voiceErrors.ts). `onEnd` fires when the recognizer is done — after our own
   * stop() AND when it ends by itself (silence, network, the server's session
   * cap) — so the session never believes a dead recognizer is still listening.
   */
  start(
    onEvent: (e: SpeechEvent) => void,
    onError: (code: string, message?: string) => void,
    onEnd?: () => void,
  ): void;
  stop(): void;
}

let subscriptions: { remove: () => void }[] = [];
let endFallback: ReturnType<typeof setTimeout> | null = null;

/** Grace for the recognizer's 'end' after stop(); past it, listeners go regardless. */
const END_GRACE_MS = 2000;

function dropSubscriptions() {
  if (endFallback) clearTimeout(endFallback);
  endFallback = null;
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
}

export const onDeviceEngine: SpeechEngine = {
  isAvailable() {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  },

  async requestPermissions() {
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted;
  },

  start(onEvent, onError, onEnd) {
    // A previous session may still be waiting for its 'end' — never stack
    // listeners, or every command would dispatch twice.
    dropSubscriptions();
    const late = new LateFinalTracker();
    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const best = e.results?.[0];
      if (!best) return;
      const event = {
        transcript: best.transcript,
        isFinal: e.isFinal,
        confidence: best.confidence,
      };
      late.onResult(event);
      onEvent(event);
    });
    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (e) => {
      onError(String(e.error ?? ''), e.message);
    });
    // The recognizer's final transcript can land AFTER stop() (server
    // recognition finalizes once audio ends). Listeners therefore live until
    // 'end'; if 'end' comes with a partial still unfinalized, it is promoted.
    const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
      const owed = late.onEnd();
      if (owed) onEvent(owed);
      dropSubscriptions();
      onEnd?.();
    });
    subscriptions = [resultSub, errorSub, endSub];

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
      // Keep listening for the late final; 'end' (or the grace timer) cleans up.
      if (subscriptions.length && !endFallback) {
        endFallback = setTimeout(dropSubscriptions, END_GRACE_MS);
      }
    }
  },
};
