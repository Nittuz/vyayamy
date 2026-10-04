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
import { logVoice } from './voiceLog';

export interface SpeechEvent {
  transcript: string;
  isFinal: boolean;
  /** 0..1, or -1 when the engine cannot report it; undefined on some partials. */
  confidence?: number;
  /** The recognizer's N-best list, best first (includes `transcript`). */
  alternatives?: string[];
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
    /** Audio capture has actually begun — until then, speech is lost. */
    onReady?: () => void,
  ): void;
  stop(): void;
}

let subscriptions: { remove: () => void }[] = [];
let endFallback: ReturnType<typeof setTimeout> | null = null;
/** Settles the CURRENT session (late final + listeners + onEnd); null once settled. */
let settleCurrent: (() => void) | null = null;

/** Words the grammar depends on, handed to the recognizer as hints. */
const CONTEXTUAL_STRINGS = [
  'for',
  'by',
  'times',
  'reps',
  'at',
  'pounds',
  'kilos',
  'done',
  'undo',
  'rest',
  'next',
  'finish',
  'yes',
];

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

  start(onEvent, onError, onEnd, onReady) {
    // A previous session may still be waiting for its 'end' — never stack
    // listeners, or every command would dispatch twice.
    dropSubscriptions();
    const late = new LateFinalTracker();
    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const best = e.results?.[0];
      if (!best) return;
      const alternatives = e.results.map((r) => r.transcript);
      const event = {
        transcript: best.transcript,
        isFinal: e.isFinal,
        confidence: best.confidence,
        alternatives,
      };
      logVoice(
        e.isFinal ? 'result.final' : 'result.partial',
        `"${best.transcript}" conf=${best.confidence ?? '?'}` +
          (e.isFinal && alternatives.length > 1
            ? ` alts=${alternatives
                .slice(1)
                .map((a) => `"${a}"`)
                .join(' ')}`
            : ''),
      );
      late.onResult(event);
      onEvent(event);
    });
    // Readiness: the audio session takes a beat to start; speech before
    // 'audiostart' is lost (two silent hold sessions on the simulator).
    const audioStartSub = ExpoSpeechRecognitionModule.addListener('audiostart', () => {
      logVoice('audio.start');
      onReady?.();
    });
    const speechStartSub = ExpoSpeechRecognitionModule.addListener('speechstart', () =>
      logVoice('speech.start'),
    );
    const speechEndSub = ExpoSpeechRecognitionModule.addListener('speechend', () =>
      logVoice('speech.end'),
    );
    const noMatchSub = ExpoSpeechRecognitionModule.addListener('nomatch', () =>
      logVoice('nomatch'),
    );
    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (e) => {
      logVoice('error', `${String(e.error ?? '')} ${e.message ?? ''}`.trim());
      onError(String(e.error ?? ''), e.message);
    });
    // The recognizer's final transcript can land AFTER stop() (server
    // recognition finalizes once audio ends). Listeners therefore live until
    // 'end'; if 'end' comes with a partial still unfinalized, it is promoted.
    const settle = () => {
      if (settleCurrent !== settle) return; // superseded or already settled
      settleCurrent = null;
      const owed = late.onEnd();
      logVoice('end', owed ? `promoted "${owed.transcript}"` : 'no promotion');
      if (owed) onEvent(owed);
      dropSubscriptions();
      onEnd?.();
    };
    settleCurrent = settle;
    const endSub = ExpoSpeechRecognitionModule.addListener('end', settle);
    subscriptions = [
      resultSub,
      errorSub,
      endSub,
      audioStartSub,
      speechStartSub,
      speechEndSub,
      noMatchSub,
    ];

    const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      // On-device when the phone supports it for this language; otherwise
      // Apple's server recognition (needs Siri & Dictation + a connection —
      // both surfaced by code through voiceErrorLabel when they are missing).
      requiresOnDeviceRecognition: onDevice,
      addsPunctuation: false,
      // Bias toward the command vocabulary (SFSpeechRecognitionRequest
      // .contextualStrings); the number formatter still fuses "for" between
      // digits, which the N-best pick in alternatives.ts recovers from.
      contextualStrings: CONTEXTUAL_STRINGS,
    });
    logVoice('engine.start', onDevice ? 'on-device' : 'server');
  },

  stop() {
    logVoice('engine.stop');
    try {
      ExpoSpeechRecognitionModule.stop();
    } finally {
      // Keep listening for the late final; 'end' (or the grace timer) settles.
      if (settleCurrent && !endFallback) {
        endFallback = setTimeout(() => {
          logVoice('end.grace', `no end event within ${END_GRACE_MS}ms`);
          settleCurrent?.();
        }, END_GRACE_MS);
      }
    }
  },
};
