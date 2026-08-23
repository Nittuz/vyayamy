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
 *  countdown re-renders only this panel, not the whole screen (Batch 2 P1). */
export function useRestClock(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() => elapsedSecondsSince(startedAt, Date.now()));
  useEffect(() => {
    setElapsed(elapsedSecondsSince(startedAt, Date.now()));
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(elapsedSecondsSince(startedAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function elapsedSecondsSince(startedAt: number | null, now: number): number {
  return startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
