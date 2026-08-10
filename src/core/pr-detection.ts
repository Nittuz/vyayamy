/**
 * Personal-record detection — pure functions only.
 *
 * computePRs(...) runs against completed sets already read from SQLite and
 * returns the authoritative best-ever PRs for one exercise. Weights are
 * normalized to kg so sets logged in different units compare correctly (#132);
 * each PR carries the completed_at of the achieving set (#142). Callers persist
 * the result into the local personal_records cache (it is derived data — never
 * synced).
 *
 * Two record types (2026-08-09 spec — best_volume is retired):
 * - heaviest_weight: max weight in any completed set.
 * - most_reps: max reps in a single completed set. Bodyweight sets (weight
 *   NULL — never 0, per the set-entry spec §4) count, so pull-ups/dips can
 *   hold a record; a rep tie goes to the heavier set, and bodyweight loses
 *   a tie to any loaded set.
 */
import type { PRType, Units } from './domain';
import { toKg } from './units';

export interface PRSet {
  weight: number | null;
  reps: number | null;
  units: Units | null;
  completed: boolean;
  completedAt: string | null;
}

export interface ComputedPR {
  type: PRType;
  /** Weights in canonical kg. */
  value: number | { reps: number; weight: number | null };
  achievedAt: string | null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePRs(sets: PRSet[]): ComputedPR[] {
  let bestWeight: { kg: number; at: string | null } | null = null;
  let bestReps: { weightKg: number | null; reps: number; at: string | null } | null = null;

  for (const s of sets) {
    if (!s.completed) continue;
    if (s.weight == null && s.reps == null) continue;
    const w = s.weight != null ? toKg(s.weight, s.units ?? 'kg') : null;
    const r = s.reps ?? 0;

    if (w != null && w > 0 && (bestWeight == null || w > bestWeight.kg)) {
      bestWeight = { kg: w, at: s.completedAt };
    }
    if (r > 0) {
      // Bodyweight (null) ranks below any loaded weight in a rep tie.
      const tieWeight = w != null && w > 0 ? w : null;
      const beats =
        bestReps == null ||
        r > bestReps.reps ||
        (r === bestReps.reps && (tieWeight ?? -1) > (bestReps.weightKg ?? -1));
      if (beats) bestReps = { weightKg: tieWeight, reps: r, at: s.completedAt };
    }
  }

  const out: ComputedPR[] = [];
  if (bestWeight)
    out.push({ type: 'heaviest_weight', value: round(bestWeight.kg), achievedAt: bestWeight.at });
  if (bestReps) {
    out.push({
      type: 'most_reps',
      value: {
        reps: bestReps.reps,
        weight: bestReps.weightKg != null ? round(bestReps.weightKg) : null,
      },
      achievedAt: bestReps.at,
    });
  }
  return out;
}
