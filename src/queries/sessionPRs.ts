/**
 * Live PR detection for the active workout (backlog 10.1 / #25).
 *
 * The post-finish `personal_records` recompute is authoritative for history,
 * but the LIVE complete-set moment needs to know — at the instant a set is
 * banked — whether it just beat the lifter's record, so the glow blooms louder
 * and the PR pill fires. One set produces at most ONE signal:
 * - a loaded set signals on heaviest weight only (per-set volume and rep PRs
 *   would add noise mid-session);
 * - a bodyweight set (null weight — the only dimension it has) signals on most
 *   reps (2026-08-09 spec), so pull-ups/dips finally get their moment.
 *
 * This is pure: it tracks a running best per exercise (weight in canonical kg,
 * reps as counts), SEEDED from the all-time cache so a set only PRs when it
 * genuinely exceeds the prior record. A brand-new exercise's first logged set
 * is recorded as the baseline, not celebrated; a later set that beats it does
 * PR. Loaded sets still raise the rep baseline (their reps count toward the
 * persisted most_reps record) — they just don't celebrate it.
 */
import { useQuery } from '@tanstack/react-query';

import type { Units } from '@/core/domain';
import { toKg } from '@/core/units';
import { getDb } from '@/db/client';

export interface SessionPRTracker {
  /** Running best heaviest weight per exercise id, in canonical kg. */
  heaviestKg: Map<string, number>;
  /** Running best single-set reps per exercise id (loaded and bodyweight). */
  mostReps: Map<string, number>;
}

/** Seed the tracker from the all-time records (weights already in kg). */
export function createSessionPRTracker(
  allTimeHeaviestKg: Record<string, number>,
  allTimeMostReps: Record<string, number>,
): SessionPRTracker {
  return {
    heaviestKg: new Map(Object.entries(allTimeHeaviestKg)),
    mostReps: new Map(Object.entries(allTimeMostReps)),
  };
}

export interface BankedSet {
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  units: Units | null;
}

/**
 * Register a freshly banked set and report whether it set a new PR for its
 * exercise (weight PR for a loaded set, rep PR for a bodyweight set). Mutates
 * the tracker's running bests so repeated PRs within one session each register
 * (set 2 beating set 1 beats the updated baseline).
 */
export function registerBankedSet(tracker: SessionPRTracker, set: BankedSet): boolean {
  const loaded = set.weight != null && set.weight > 0;
  const reps = set.reps ?? 0;

  // Rep baseline advances on EVERY set so a bodyweight set can't celebrate a
  // bar that a loaded set already raised; only bodyweight sets celebrate it.
  let repPR = false;
  if (reps > 0) {
    const prior = tracker.mostReps.get(set.exerciseId);
    if (prior == null) {
      tracker.mostReps.set(set.exerciseId, reps);
    } else if (reps > prior) {
      tracker.mostReps.set(set.exerciseId, reps);
      repPR = !loaded;
    }
  }
  if (!loaded) return repPR;

  const kg = toKg(set.weight!, set.units ?? 'kg');
  const prior = tracker.heaviestKg.get(set.exerciseId);
  if (prior == null) {
    // First data point for this exercise (no all-time record, no prior set this
    // session). Establish the baseline; don't celebrate a first-ever lift.
    tracker.heaviestKg.set(set.exerciseId, kg);
    return false;
  }
  if (kg > prior) {
    tracker.heaviestKg.set(set.exerciseId, kg);
    return true;
  }
  return false;
}

export interface AllTimePRSeeds {
  /** All-time heaviest weight per exercise id, canonical kg. */
  heaviestKg: Record<string, number>;
  /** All-time best single-set reps per exercise id. */
  mostReps: Record<string, number>;
}

/**
 * Read each exercise's all-time bests to seed the live tracker.
 *
 * Weight seeds come from the personal_records cache (heaviest_weight rows are
 * stable across schema changes and already kg-normalized; JSON-encoded
 * numbers, e.g. "102.5"). Rep seeds are computed straight from the sets table:
 * most_reps cache rows only exist after a recompute (they shipped 2026-08-09
 * and backfill is gated behind a Progress mount), and an unseeded rep baseline
 * would let a mid-session bodyweight set celebrate a bogus rep PR. MAX(reps)
 * needs no unit normalization, so the direct query is exact.
 *
 * Exported for tests; UI goes through useAllTimePRSeeds.
 */
export async function fetchAllTimePRSeeds(userId: string): Promise<AllTimePRSeeds> {
  const db = await getDb();
  const weightRows = await db.getAllAsync<{ exercise_id: string; value: string | number }>(
    `SELECT exercise_id, value FROM personal_records
       WHERE user_id = ? AND type = 'heaviest_weight'`,
    [userId],
  );
  const repRows = await db.getAllAsync<{ exercise_id: string; reps: number | null }>(
    `SELECT we.exercise_id AS exercise_id, MAX(s.reps) AS reps
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND s.completed = 1 AND s.reps IS NOT NULL
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
        AND w.ended_at IS NOT NULL
      GROUP BY we.exercise_id`,
    [userId],
  );
  const out: AllTimePRSeeds = { heaviestKg: {}, mostReps: {} };
  for (const r of weightRows) {
    let decoded: unknown = r.value;
    if (typeof r.value === 'string') {
      try {
        decoded = JSON.parse(r.value);
      } catch {
        continue;
      }
    }
    const kg = Number(decoded);
    if (Number.isFinite(kg)) out.heaviestKg[r.exercise_id] = kg;
  }
  for (const r of repRows) {
    if (r.reps != null && Number.isFinite(r.reps) && r.reps > 0) {
      out.mostReps[r.exercise_id] = r.reps;
    }
  }
  return out;
}

/** Seed data for the live PR tracker: all-time bests per exercise. */
export function useAllTimePRSeeds(userId: string | undefined) {
  return useQuery({
    queryKey: ['sessionPRs', 'seeds', userId ?? 'none'],
    queryFn: () =>
      userId ? fetchAllTimePRSeeds(userId) : Promise.resolve({ heaviestKg: {}, mostReps: {} }),
    enabled: !!userId,
  });
}
