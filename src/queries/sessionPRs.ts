/**
 * Live PR detection for the active workout (backlog 10.1 / #25).
 *
 * The post-finish `personal_records` recompute is authoritative for history,
 * but the LIVE complete-set moment needs to know — at the instant a set is
 * banked — whether it just beat the lifter's heaviest-ever weight, so the glow
 * blooms louder and the PR pill fires. Heaviest weight is the one unambiguous,
 * legible live signal (per-set volume and rep PRs add noise mid-session).
 *
 * This is pure: it tracks a running best per exercise in canonical kg, SEEDED
 * from the all-time cache so a set only PRs when it genuinely exceeds the prior
 * record. A brand-new exercise's first logged set is recorded as the baseline,
 * not celebrated; a later set that beats it does PR.
 */
import { useQuery } from '@tanstack/react-query';

import type { Units } from '@/core/domain';
import { toKg } from '@/core/units';
import { getDb } from '@/db/client';

export interface SessionPRTracker {
  /** Running best heaviest weight per exercise id, in canonical kg. */
  heaviestKg: Map<string, number>;
}

/** Seed the tracker from the all-time heaviest-weight records (already in kg). */
export function createSessionPRTracker(
  allTimeHeaviestKg: Record<string, number>,
): SessionPRTracker {
  return { heaviestKg: new Map(Object.entries(allTimeHeaviestKg)) };
}

export interface BankedSet {
  exerciseId: string;
  weight: number | null;
  units: Units | null;
}

/**
 * Register a freshly banked set and report whether it set a new heaviest-weight
 * PR for its exercise. Mutates the tracker's running best so repeated PRs within
 * one session each register (set 2 beating set 1 beats the updated baseline).
 */
export function registerBankedSet(tracker: SessionPRTracker, set: BankedSet): boolean {
  if (set.weight == null || set.weight <= 0) return false;
  const kg = toKg(set.weight, set.units ?? 'kg');
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

/**
 * Read each exercise's all-time heaviest-weight record (canonical kg) from the
 * local personal_records cache, to seed the live tracker. Values are stored as
 * a JSON-encoded number, e.g. "102.5".
 */
async function fetchAllTimeHeaviestKg(userId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ exercise_id: string; value: string | number }>(
    `SELECT exercise_id, value FROM personal_records
       WHERE user_id = ? AND type = 'heaviest_weight'`,
    [userId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    let kg = typeof r.value === 'number' ? r.value : Number(r.value);
    if (!Number.isFinite(kg) && typeof r.value === 'string') {
      try {
        kg = Number(JSON.parse(r.value));
      } catch {
        continue;
      }
    }
    if (Number.isFinite(kg)) out[r.exercise_id] = kg;
  }
  return out;
}

/** Seed data for the live PR tracker: all-time heaviest per exercise, in kg. */
export function useAllTimeHeaviestKg(userId: string | undefined) {
  return useQuery({
    queryKey: ['sessionPRs', 'heaviestKg', userId ?? 'none'],
    queryFn: () => (userId ? fetchAllTimeHeaviestKg(userId) : Promise.resolve({})),
    enabled: !!userId,
  });
}
