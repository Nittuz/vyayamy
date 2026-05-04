/**
 * Personal-record detection — pure functions only.
 *
 * Ported from legacy-web/src/lib/pr-detection.ts with the Supabase-coupled
 * persistence helper removed. The mobile client calls detectNewPRs(...)
 * against rows already read from SQLite, then enqueues upserts via the
 * outbox like any other mutation.
 */
import type { PRType } from './domain';

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
      w > 0 &&
      r > 0 &&
      (bestRepsAtWeight == null ||
        r > bestRepsAtWeight.reps ||
        (r === bestRepsAtWeight.reps && w > bestRepsAtWeight.weight))
    ) {
      bestRepsAtWeight = { weight: w, reps: r };
    }
  }

  return { bestWeight, bestVolume, bestRepsAtWeight };
}

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
