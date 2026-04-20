/**
 * Pure workout-session logic — no React, no DOM, no Supabase.
 *
 * These helpers compute workout metrics (volume, set counts, elapsed time,
 * summary) and can be reused by any client surface.
 */

import type { Set } from '../types/database';
import type { WorkoutSummary } from './domain';

type SetLike = Pick<Set, 'id' | 'weight' | 'reps' | 'completed'>;

type ExerciseWithSets = { sets: SetLike[] };

export function computeVolume(
  exercises: ExerciseWithSets[],
  hiddenSetIds?: ReadonlySet<string>,
): number {
  let vol = 0;
  for (const we of exercises) {
    for (const s of we.sets) {
      if (hiddenSetIds?.has(s.id)) continue;
      if (s.completed && s.weight != null && s.reps != null) {
        vol += s.weight * s.reps;
      }
    }
  }
  return vol;
}

export function computeSetCounts(
  exercises: ExerciseWithSets[],
  hiddenSetIds?: ReadonlySet<string>,
): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const we of exercises) {
    for (const s of we.sets) {
      if (hiddenSetIds?.has(s.id)) continue;
      total++;
      if (s.completed) completed++;
    }
  }
  return { completed, total };
}

export function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

/**
 * Compute a human-readable elapsed-time string from a start timestamp.
 * Pure function — call it on an interval from a React hook or a native timer.
 */
export function computeElapsedDisplay(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function buildFinishSummary(
  exercises: ExerciseWithSets[],
  prCount: number,
  elapsed: string,
): WorkoutSummary {
  const { completed, total } = computeSetCounts(exercises);
  const volume = computeVolume(exercises);
  return { completedSets: completed, totalSets: total, volume, prCount, duration: elapsed };
}
