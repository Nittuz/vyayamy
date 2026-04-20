/**
 * Personal-record detection — split into pure computation and persistence.
 *
 * `computeBestMetrics` and `detectNewPRs` are pure functions that can be
 * tested and reused without Supabase. `detectAndInsertPRs` is the persistence
 * orchestrator that calls them.
 */

import type { PRType } from './domain';
import { supabase } from './supabase';

// ── Pure types ──

type SetRow = { weight: number | null; reps: number | null; completed: boolean };

export type WorkoutExerciseRow = { exercise_id: string; sets: SetRow[] };

export type BestMetrics = {
  bestWeight: number | null;
  bestVolume: number;
  bestRepsAtWeight: { weight: number; reps: number } | null;
};

export type PRCandidate = {
  type: PRType;
  value: number | { weight: number; reps: number };
};

// ── Pure functions ──

export function computeBestMetrics(sets: SetRow[]): BestMetrics {
  const completed = sets.filter((s) => s.completed && (s.weight != null || s.reps != null));

  let bestWeight: number | null = null;
  let bestVolume = 0;
  let bestRepsAtWeight: { weight: number; reps: number } | null = null;

  for (const s of completed) {
    const w = s.weight ?? 0;
    const r = s.reps ?? 0;
    const vol = w * r;
    if (w > 0 && (bestWeight == null || w > bestWeight)) bestWeight = w;
    if (vol > bestVolume) bestVolume = vol;
    if (
      w > 0 && r > 0 &&
      (bestRepsAtWeight == null ||
        r > bestRepsAtWeight.reps ||
        (r === bestRepsAtWeight.reps && w > bestRepsAtWeight.weight))
    ) {
      bestRepsAtWeight = { weight: w, reps: r };
    }
  }

  return { bestWeight, bestVolume, bestRepsAtWeight };
}

/**
 * Compare workout metrics against existing PRs and return the new records.
 * Pure — no side effects.
 */
export function detectNewPRs(
  metrics: BestMetrics,
  existingByType: Map<string, unknown>,
): PRCandidate[] {
  const candidates: PRCandidate[] = [];

  if (metrics.bestWeight != null) {
    const prev = existingByType.get('heaviest_weight') as number | undefined;
    if (prev == null || metrics.bestWeight > prev) {
      candidates.push({ type: 'heaviest_weight', value: metrics.bestWeight });
    }
  }

  if (metrics.bestVolume > 0) {
    const prev = existingByType.get('best_volume') as number | undefined;
    if (prev == null || metrics.bestVolume > prev) {
      candidates.push({ type: 'best_volume', value: metrics.bestVolume });
    }
  }

  if (metrics.bestRepsAtWeight != null) {
    const prev = existingByType.get('most_reps_at_weight') as
      | { weight: number; reps: number }
      | undefined;
    const isBetter =
      prev == null ||
      metrics.bestRepsAtWeight.reps > prev.reps ||
      (metrics.bestRepsAtWeight.reps === prev.reps &&
        metrics.bestRepsAtWeight.weight > prev.weight);
    if (isBetter) {
      candidates.push({ type: 'most_reps_at_weight', value: metrics.bestRepsAtWeight });
    }
  }

  return candidates;
}

// ── Persistence orchestrator ──

async function upsertPR(
  userId: string,
  exerciseId: string,
  type: string,
  value: unknown,
  achievedAt: string,
  workoutId: string,
) {
  // TODO(phase-6): include set_id for more granular PR provenance tracking
  await supabase.from('personal_records').upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      type,
      value: value as never,
      achieved_at: achievedAt,
      workout_id: workoutId,
    },
    { onConflict: 'user_id,exercise_id,type' },
  );
}

export async function detectAndInsertPRs(
  userId: string,
  workoutId: string,
  workoutExercises: WorkoutExerciseRow[],
): Promise<number> {
  let prCount = 0;

  for (const we of workoutExercises) {
    const metrics = computeBestMetrics(we.sets);
    if (metrics.bestWeight == null && metrics.bestVolume === 0 && metrics.bestRepsAtWeight == null) {
      continue;
    }

    const { data: existing } = await supabase
      .from('personal_records')
      .select('type, value')
      .eq('user_id', userId)
      .eq('exercise_id', we.exercise_id);

    const existingByType = new Map(
      (existing ?? []).map((r: { type: string; value: unknown }) => [r.type, r.value]),
    );

    const candidates = detectNewPRs(metrics, existingByType);
    const achievedAt = new Date().toISOString();

    for (const pr of candidates) {
      await upsertPR(userId, we.exercise_id, pr.type, pr.value, achievedAt, workoutId);
      prCount++;
    }
  }

  return prCount;
}
