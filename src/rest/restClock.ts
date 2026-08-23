/**
 * The rest countdown's self-ticking clock (Batch 2 Task 1 / P1 perf fix).
 *
 * Split out of RestProgressBar.tsx so this pure/hook logic can be unit-tested
 * directly: every other file under src/rest imports react-native or
 * react-native-reanimated transitively, which this project's ts-jest setup
 * doesn't transform (see jest.setup.js — "tests are pure TS"). Keep this file
 * free of RN imports so `restClock.test.ts` can import it without a
 * component-rendering harness.
 */
import { useEffect, useState } from 'react';

/** Seconds since startedAt, self-ticking at 250ms — scoped so the rest
 *  countdown re-renders only this panel, not the whole screen (Batch 2 P1).
 *
 *  `startedAt` transitions (fresh start, restore, back-to-back rest) are
 *  applied synchronously during render via the adjust-state-during-render
 *  pattern, not from an effect — an effect only runs AFTER the render that
 *  received the new `startedAt`, so it would paint one stale frame (e.g. a
 *  restored already-elapsed timer briefly showing 0:00/full bar, or a
 *  back-to-back rest flashing the previous rest's tail value) before
 *  correcting itself. The effect below only owns the 250ms tick. */
export function useRestClock(startedAt: number | null): number {
  const [prevStartedAt, setPrevStartedAt] = useState(startedAt);
  const [elapsed, setElapsed] = useState(() => elapsedSecondsSince(startedAt, Date.now()));
  if (startedAt !== prevStartedAt) {
    setPrevStartedAt(startedAt);
    setElapsed(elapsedSecondsSince(startedAt, Date.now()));
  }
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(elapsedSecondsSince(startedAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function elapsedSecondsSince(startedAt: number | null, now: number): number {
  return startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
