/**
 * Personal-record detection — pure functions only.
 *
 * computePRs(...) runs against completed sets already read from SQLite and
 * returns the authoritative best-ever PRs for one exercise. Weights are
 * normalized to kg so sets logged in different units compare correctly (#132);
 * each PR carries the completed_at of the achieving set (#142). Callers persist
 * the result into the local personal_records cache (it is derived data — never
 * synced).
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
  /** Value in canonical kg. */
  value: number | { weight: number; reps: number };
  achievedAt: string | null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePRs(sets: PRSet[]): ComputedPR[] {
  let bestWeight: { kg: number; at: string | null } | null = null;
  let bestVolume: { kg: number; at: string | null } | null = null;
  let bestReps: { weightKg: number; reps: number; at: string | null } | null = null;

  for (const s of sets) {
    if (!s.completed) continue;
    if (s.weight == null && s.reps == null) continue;
    const w = s.weight != null ? toKg(s.weight, s.units ?? 'kg') : 0;
    const r = s.reps ?? 0;
    const vol = w * r;

    if (w > 0 && (bestWeight == null || w > bestWeight.kg)) {
      bestWeight = { kg: w, at: s.completedAt };
    }
    if (vol > 0 && (bestVolume == null || vol > bestVolume.kg)) {
      bestVolume = { kg: vol, at: s.completedAt };
    }
    if (
      w > 0 &&
      r > 0 &&
      (bestReps == null || r > bestReps.reps || (r === bestReps.reps && w > bestReps.weightKg))
    ) {
      bestReps = { weightKg: w, reps: r, at: s.completedAt };
    }
  }

  const out: ComputedPR[] = [];
  if (bestWeight)
    out.push({ type: 'heaviest_weight', value: round(bestWeight.kg), achievedAt: bestWeight.at });
  if (bestVolume)
    out.push({ type: 'best_volume', value: round(bestVolume.kg), achievedAt: bestVolume.at });
  if (bestReps) {
    out.push({
      type: 'most_reps_at_weight',
      value: { weight: round(bestReps.weightKg), reps: bestReps.reps },
      achievedAt: bestReps.at,
    });
  }
  return out;
}
