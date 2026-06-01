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
import { useCallback, useRef, useState } from 'react';

import type { Command, VoiceContext } from './commands';
import { dispatchCommand, type DispatchContext } from './dispatch';
import { GrammarParser } from './grammar';
import { onDeviceEngine, type SpeechEngine } from './speechEngine';

export type VoiceUiState =
  | { phase: 'idle' }
  | { phase: 'listening'; partial: string }
  | { phase: 'pending'; command: Command; label: string }
  | { phase: 'applied'; label: string };

export interface VoiceSessionDeps {
  engine?: SpeechEngine;
  getDispatchContext: () => DispatchContext;
  getParserContext: () => VoiceContext;
  onStartRest: (seconds?: number) => void;
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
  const lastUndo = useRef<null | (() => Promise<void>)>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    engine.stop();
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
      }
    },
    [deps],
  );

  const handleCommand = useCallback(
    async (command: Command, confidence: 'high' | 'low') => {
      switch (command.kind) {
        case 'stop':
          return stop();
        case 'undo': {
          if (lastUndo.current) {
            await lastUndo.current();
            lastUndo.current = null;
          }
          setUi({ phase: 'listening', partial: '' });
          return;
        }
        case 'finishWorkout':
          return deps.onFinishWorkout();
        case 'startRest':
          return deps.onStartRest(command.seconds);
        case 'nextExercise':
          return deps.onNextExercise();
        case 'prevExercise':
          return deps.onPrevExercise();
        case 'completeSet':
          if (deps.onCompleteSet) {
            deps.onCompleteSet();
            setUi({ phase: 'applied', label: 'Set complete' });
            return;
          }
          return runDataCommand(command);
        default: {
          if (confidence === 'low') {
            setUi({ phase: 'pending', command, label: describe(command) });
            return;
          }
          return runDataCommand(command);
        }
      }
    },
    [deps, runDataCommand, stop],
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

  const start = useCallback(async () => {
    if (!(await engine.requestPermissions())) return;
    setUi({ phase: 'listening', partial: '' });
    resetSilence();
    engine.start(
      (e) => {
        if (e.isFinal) onFinal(e.transcript);
        else setUi({ phase: 'listening', partial: e.transcript });
      },
      () => stop(),
    );
  }, [engine, onFinal, resetSilence, stop]);

  const confirmPending = useCallback(async () => {
    if (ui.phase === 'pending') await runDataCommand(ui.command);
  }, [ui, runDataCommand]);

  const available = engine.isAvailable();

  return { ui, available, start, stop, confirmPending };
}

function describe(c: Command): string {
  if (c.kind === 'setValues') return `${c.weight ?? '—'} × ${c.reps ?? '—'}`;
  return c.kind;
}
