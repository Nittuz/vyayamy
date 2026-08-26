/**
 * Voice listening session.
 *
 * Owns the engine lifecycle and routes parsed commands: data commands go
 * through `dispatchCommand` (with undo), session/navigation/timer commands go to
 * injected callbacks. Confidence routing: high-confidence data commands apply
 * immediately; low-confidence ones become a pending confirm. Unparseable
 * transcripts are ignored (chatter guard).
 *
 * Uses React Native hooks + the native engine — verified via on-device QA, not
 * unit-tested in the ts-jest/Node harness. The pure pieces it composes
 * (GrammarParser, dispatchCommand) are unit-tested.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Command, VoiceContext } from './commands';
import { dispatchCommand, type DispatchContext } from './dispatch';
import { GrammarParser } from './grammar';
import { onDeviceEngine, type SpeechEngine } from './speechEngine';

export type VoiceUiState =
  | { phase: 'idle' }
  | { phase: 'listening'; partial: string }
  | { phase: 'pending'; command: Command; label: string }
  | { phase: 'applied'; label: string }
  | { phase: 'error'; label: string };

export interface VoiceSessionDeps {
  engine?: SpeechEngine;
  getDispatchContext: () => DispatchContext;
  getParserContext: () => VoiceContext;
  onStartRest: (seconds?: number) => void;
  onStopRest?: () => void;
  onNextExercise: () => void;
  onPrevExercise: () => void;
  onFinishWorkout: () => void;
  /** When provided, "done" runs the screen's canonical completion (timer + auto-stage). */
  onCompleteSet?: () => void;
  silenceTimeoutMs?: number;
}

export function useVoiceSession(deps: VoiceSessionDeps) {
  const engine = deps.engine ?? onDeviceEngine;
  const [ui, setUi] = useState<VoiceUiState>({ phase: 'idle' });
  // Whether the speech engine is actually capturing audio. ui.phase alone
  // can't answer that: 'pending'/'applied'/'error' occur both mid-session
  // (engine live, continuous listening) and preserved after a hold release
  // (engine stopped) — and the mic button's volt state must track the mic,
  // not the card narration (review minor 2).
  const [engineOn, setEngineOn] = useState(false);
  const lastUndo = useRef<null | (() => Promise<void>)>(null);
  const pendingRef = useRef<Command | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    pendingRef.current = null;
    engine.stop();
    setEngineOn(false);
    setUi({ phase: 'idle' });
  }, [engine]);

  const resetSilence = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => stop(), deps.silenceTimeoutMs ?? 15000);
  }, [deps.silenceTimeoutMs, stop]);

  const runDataCommand = useCallback(
    async (command: Command) => {
      const res = await dispatchCommand(command, deps.getDispatchContext());
      if (res.ok) {
        lastUndo.current = res.undo ?? null;
        setUi({ phase: 'applied', label: res.message });
      } else {
        // Don't fail silently — show what went wrong (#104).
        setUi({ phase: 'error', label: res.message });
      }
    },
    [deps],
  );

  const applyPending = useCallback(async () => {
    const cmd = pendingRef.current;
    if (cmd) {
      pendingRef.current = null;
      await runDataCommand(cmd);
    }
  }, [runDataCommand]);

  const handleCommand = useCallback(
    async (command: Command, confidence: 'high' | 'low') => {
      switch (command.kind) {
        case 'stop':
          lastUndo.current = null;
          return stop();
        case 'undo': {
          if (lastUndo.current) {
            await lastUndo.current();
            lastUndo.current = null;
          }
          setUi({ phase: 'listening', partial: '' });
          return;
        }
        case 'confirm':
          return applyPending();
        case 'finishWorkout':
          // A non-data command invalidates the pending undo — "undo" must never
          // reach back past it and revert a set the user already moved on from (#99).
          lastUndo.current = null;
          return deps.onFinishWorkout();
        case 'startRest':
          return deps.onStartRest(command.seconds);
        case 'stopRest':
          return deps.onStopRest?.();
        case 'nextExercise':
          lastUndo.current = null;
          return deps.onNextExercise();
        case 'prevExercise':
          lastUndo.current = null;
          return deps.onPrevExercise();
        case 'completeSet':
          lastUndo.current = null;
          if (deps.onCompleteSet) {
            deps.onCompleteSet();
            setUi({ phase: 'applied', label: 'Set complete' });
            return;
          }
          return runDataCommand(command);
        default: {
          if (confidence === 'low') {
            pendingRef.current = command;
            setUi({ phase: 'pending', command, label: describe(command) });
            return;
          }
          return runDataCommand(command);
        }
      }
    },
    [deps, runDataCommand, applyPending, stop],
  );

  const onFinal = useCallback(
    (transcript: string) => {
      resetSilence();
      const parsed = GrammarParser.parse(transcript, deps.getParserContext());
      if (!parsed) return; // chatter guard
      void handleCommand(parsed.command, parsed.confidence);
    },
    [deps, handleCommand, resetSilence],
  );

  const listeningRef = useRef(false);
  const start = useCallback(async () => {
    // Re-entrancy guard: a second start() while already listening would register
    // a second result listener and every command would dispatch twice (#97).
    if (listeningRef.current) return;
    if (!(await engine.requestPermissions())) {
      // Surface the denial (the screen can route to Settings) instead of a
      // dead mic button (#104).
      setUi({ phase: 'error', label: 'Microphone access needed' });
      return;
    }
    listeningRef.current = true;
    setEngineOn(true);
    setUi({ phase: 'listening', partial: '' });
    resetSilence();
    engine.start(
      (e) => {
        if (e.isFinal) onFinal(e.transcript);
        else setUi({ phase: 'listening', partial: e.transcript });
      },
      () => {
        stop(); // resets ui to idle...
        setUi({ phase: 'error', label: 'Voice unavailable' }); // ...so surface after
      },
    );
  }, [engine, onFinal, resetSilence, stop]);

  // Hold-to-talk release. stop() is the tap-toggle reset — using it on hold
  // release also wiped whatever the session surfaced mid-hold, so a failed
  // start ('error') or a low-confidence command awaiting the Confirm button
  // ('pending') vanished the instant the finger lifted (2026-08-25 regression
  // run). Release stops the engine but only resets a LISTENING ui; surfaced
  // outcomes stay on the card, and pendingRef survives for confirmPending.
  // When the release DOES land as idle (nothing was surfaced), the pending
  // command must die with the session — otherwise a re-hold that goes silent
  // leaves a stale command that a later "yes" would apply with no card
  // narrating it (review minor 1).
  const phaseRef = useRef(ui.phase);
  useEffect(() => {
    phaseRef.current = ui.phase;
  }, [ui.phase]);
  const release = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    engine.stop();
    setEngineOn(false);
    listeningRef.current = false;
    if (phaseRef.current === 'listening') pendingRef.current = null;
    setUi((prev) => (prev.phase === 'listening' ? { phase: 'idle' } : prev));
  }, [engine]);

  // Keep the listening flag in sync when stop() runs (silence timeout, command, etc.).
  useEffect(() => {
    if (ui.phase === 'idle') listeningRef.current = false;
  }, [ui.phase]);

  // Stop the mic when the screen unmounts or the app backgrounds — otherwise the
  // engine keeps listening (and dispatching) after the user leaves (#96).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [stop]);

  const available = engine.isAvailable();

  return { ui, engineOn, available, start, stop, release, confirmPending: applyPending };
}

function describe(c: Command): string {
  if (c.kind === 'setValues') return `${c.weight ?? '-'} × ${c.reps ?? '-'}`;
  if (c.kind === 'addExercise') return `Add ${c.name}`;
  return c.kind;
}
