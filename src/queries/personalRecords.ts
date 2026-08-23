/**
 * Personal records — a LOCAL DERIVED CACHE, not synced data (#138–145).
 *
 * personal_records is recomputed from the user's completed sets (which DO sync),
 * so it is never pushed or pulled — that removes the cross-device PK collision,
 * the lower-value-wins LWW regression, and the zero-row-update loss. Recompute
 * is authoritative: it writes a PR down as well as up, and deletes a PR whose
 * backing set is gone, so a deleted set can never leave a phantom record.
 *
 * Values are stored in canonical kg (so a unit switch can't mint fake PRs) and
 * converted to the user's display unit on read. achieved_at is the completed_at
 * of the achieving set. Only sets from FINISHED workouts count.
 */
import { useQuery } from '@tanstack/react-query';

import { computePRs } from '@/core/pr-detection';
import { localDayKey } from '@/core/format';
import { getDb } from '@/db/client';
import { withTransaction } from '@/db/transaction';
import { nowIso, uuidv4 } from '@/db/uuid';
import { parsePRValue, type GroupedPR, type GroupedPRRecordValue, type Units } from '@/core/domain';
import { convertWeight, DEFAULT_UNITS } from '@/core/units';
import type { PersonalRecord } from '@/db/types';

import { queryKeys } from './keys';

interface Row extends PersonalRecord {
  exercise_name: string | null;
  muscle_group: string | null;
}

// Display precedence order: heaviest leads everywhere. Retired types
// (best_volume, most_reps_at_weight — 2026-08-09 spec) are swept by recompute.
const PR_TYPES = ['heaviest_weight', 'most_reps'] as const;
const PR_TYPE_PLACEHOLDERS = PR_TYPES.map(() => '?').join(', ');

// Recompute is serialized through one promise chain so concurrent triggers
// (finish + Progress mount + post-pull) can't race into UNIQUE-constraint
// failures on first-ever PRs (#141).
let prChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = prChain.then(fn, fn);
  prChain = run.catch(() => undefined);
  return run;
}

/**
 * Recompute one exercise's PRs from every completed set in a FINISHED workout
 * and write the result authoritatively into the local cache.
 */
async function recomputeExercisePRsInternal(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const sets = await db.getAllAsync<{
    weight: number | null;
    reps: number | null;
    units: Units | null;
    completed: number;
    completed_at: string | null;
  }>(
    `SELECT s.weight, s.reps, s.units, s.completed, s.completed_at
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND we.exercise_id = ?
        AND s.completed = 1 AND s.deleted_at IS NULL
        AND we.deleted_at IS NULL AND w.deleted_at IS NULL
        AND w.ended_at IS NOT NULL`,
    [userId, exerciseId],
  );

  const prs = computePRs(
    sets.map((s) => ({
      weight: s.weight,
      reps: s.reps,
      units: s.units,
      completed: Boolean(s.completed),
      completedAt: s.completed_at,
    })),
  );
  const byType = new Map(prs.map((p) => [p.type, p]));
  const now = nowIso();

  await withTransaction(db, async () => {
    const existing = await db.getAllAsync<{ id: string; type: string }>(
      `SELECT id, type FROM personal_records WHERE user_id = ? AND exercise_id = ? AND deleted_at IS NULL`,
      [userId, exerciseId],
    );
    const idByType = new Map(existing.map((r) => [r.type, r.id]));

    for (const type of PR_TYPES) {
      const pr = byType.get(type);
      const id = idByType.get(type);
      if (pr) {
        const value = JSON.stringify(pr.value);
        const achievedAt = pr.achievedAt ?? now;
        if (id) {
          await db.runAsync(
            `UPDATE personal_records SET value = ?, achieved_at = ?, updated_at = ? WHERE id = ?`,
            [value, achievedAt, now, id],
          );
        } else {
          await db.runAsync(
            `INSERT INTO personal_records (id, user_id, exercise_id, type, value, achieved_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, exerciseId, type, value, achievedAt, now, now],
          );
        }
      } else if (id) {
        // No qualifying set left for this type → drop the stale PR (#138). It is
        // a local cache, so a hard delete is correct.
        await db.runAsync(`DELETE FROM personal_records WHERE id = ?`, [id]);
      }
    }

    // Sweep rows of retired record types for this exercise — the loop above
    // only visits current PR_TYPES, so old-schema rows would linger forever.
    await db.runAsync(
      `DELETE FROM personal_records
        WHERE user_id = ? AND exercise_id = ? AND type NOT IN (${PR_TYPE_PLACEHOLDERS})`,
      [userId, exerciseId, ...PR_TYPES],
    );
  });
}

export async function recomputeExercisePRs(userId: string, exerciseId: string): Promise<void> {
  const db = await getDb();
  return serialize(() => recomputeExercisePRsInternal(db, userId, exerciseId));
}

/**
 * Recompute PRs for every exercise in a just-finished workout. Called from the
 * finish flow (after ended_at is set, so the workout's sets now count).
 */
export async function recordWorkoutPRs(userId: string, workoutId: string): Promise<void> {
  const db = await getDb();
  const exerciseRows = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT exercise_id FROM workout_exercises
       WHERE workout_id = ? AND deleted_at IS NULL`,
    [workoutId],
  );
  for (const { exercise_id } of exerciseRows) {
    await recomputeExercisePRs(userId, exercise_id);
  }
}

/**
 * Recompute PRs across every exercise the user has finished a set for. Used on
 * Progress mount and after a pull, so deleted/edited/cross-device sets are
 * reflected. Authoritative, so it self-heals phantom records.
 */
export async function recomputeAllPRs(userId: string): Promise<void> {
  const db = await getDb();
  // Global sweep of retired-type rows first: the per-exercise recompute below
  // only reaches exercises that still have completed sets, so an orphaned
  // best_volume row for a since-emptied exercise would otherwise survive.
  await serialize(() =>
    db.runAsync(
      `DELETE FROM personal_records WHERE user_id = ? AND type NOT IN (${PR_TYPE_PLACEHOLDERS})`,
      [userId, ...PR_TYPES],
    ),
  );
  const exerciseRows = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT we.exercise_id
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND s.completed = 1
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
        AND w.ended_at IS NOT NULL`,
    [userId],
  );
  for (const { exercise_id } of exerciseRows) {
    await recomputeExercisePRs(userId, exercise_id);
  }
}

function decodePRValue(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function show(n: number): string {
  return String(round1(n));
}

interface FormattedRecord {
  display: string;
  /** Same value the display string was built from, kept structured (impeccable polish C)
   *  so callers that compose their own layout (stat tiles, row-list strip) don't have to
   *  re-parse `display`. Null only when the stored value fails to parse. */
  structured: GroupedPRRecordValue | null;
}

/** Format a stored (kg) PR value for display in the user's unit, alongside its structured form. */
function formatRecord(type: string, value: unknown, units: Units): FormattedRecord {
  const parsed = parsePRValue(type, decodePRValue(value) as never);
  if (!parsed) return { display: String(decodePRValue(value)), structured: null };
  switch (parsed.type) {
    case 'heaviest_weight': {
      const weight = round1(convertWeight(parsed.value, 'kg', units));
      return { display: String(weight), structured: { type: 'heaviest_weight', weight } };
    }
    case 'most_reps': {
      // Reps lead — they ARE this record. "15 BW" for a bodyweight record
      // (weight NULL, never 0); "12 × 80 kg" for a loaded one — the unit is
      // spelled out because the weight is converted to the display unit and a
      // bare converted number beside the unit-suffixed Heaviest tile would be
      // ambiguous.
      const { reps } = parsed.value;
      const weight =
        parsed.value.weight == null
          ? null
          : round1(convertWeight(parsed.value.weight, 'kg', units));
      const display = weight == null ? `${reps} BW` : `${reps} × ${show(weight)} ${units}`;
      return { display, structured: { type: 'most_reps', reps, weight } };
    }
  }
}

type GroupedPRItem = GroupedPR extends { records: (infer R)[] } ? R : never;

export async function getGroupedPRs(
  userId: string,
  units: Units = DEFAULT_UNITS,
): Promise<GroupedPR[]> {
  const db = await getDb();
  // Type filter: retired-type rows can exist until the next recompute sweeps
  // them; they must never render (their labels are gone).
  const rows = await db.getAllAsync<Row>(
    `SELECT pr.*, ex.name AS exercise_name, ex.muscle_group AS muscle_group
       FROM personal_records pr
       LEFT JOIN exercises ex ON ex.id = pr.exercise_id
       WHERE pr.user_id = ? AND pr.deleted_at IS NULL
         AND pr.type IN (${PR_TYPE_PLACEHOLDERS})
       ORDER BY pr.achieved_at DESC`,
    [userId, ...PR_TYPES],
  );

  const grouped = new Map<string, GroupedPR>();
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    let bucket = grouped.get(r.exercise_id);
    if (!bucket) {
      bucket = {
        exerciseId: r.exercise_id,
        exerciseName: r.exercise_name ?? 'Unknown',
        muscleGroup: r.muscle_group ?? null,
        records: [],
        hasRecent: false,
      };
      grouped.set(r.exercise_id, bucket);
    }
    const isRecent = new Date(r.achieved_at).getTime() > recentCutoff;
    const formatted = formatRecord(r.type, r.value, units);
    const rec: GroupedPRItem = {
      id: r.id,
      type: r.type as GroupedPRItem['type'],
      displayValue: formatted.display,
      value: formatted.structured,
      achievedAt: r.achieved_at,
      isRecent,
    };
    bucket.records.push(rec);
    if (isRecent) bucket.hasRecent = true;
  }

  // Fixed display precedence within an exercise (heaviest first) — SQL recency
  // order would make the leading label effectively random.
  const precedence = new Map<string, number>(PR_TYPES.map((t, i) => [t, i]));
  for (const bucket of grouped.values()) {
    bucket.records.sort(
      (a, b) =>
        (precedence.get(a.type) ?? PR_TYPES.length) - (precedence.get(b.type) ?? PR_TYPES.length),
    );
  }

  return Array.from(grouped.values()).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

export function useGroupedPRs(userId: string | undefined, units: Units = DEFAULT_UNITS) {
  return useQuery({
    queryKey: userId ? [...queryKeys.personalRecords(userId), units] : ['personal_records', 'none'],
    queryFn: () => (userId ? getGroupedPRs(userId, units) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export type WeightPoint = { achievedAt: string; weight: number };

export async function getHeaviestWeightHistory(
  userId: string,
  exerciseId: string,
  units: Units = DEFAULT_UNITS,
): Promise<WeightPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    achieved_at: string;
    weight: number | null;
    units: Units | null;
  }>(
    `SELECT s.completed_at AS achieved_at, s.weight AS weight, s.units AS units
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND we.exercise_id = ?
         AND s.completed = 1 AND s.deleted_at IS NULL
         AND we.deleted_at IS NULL AND w.deleted_at IS NULL
         AND w.ended_at IS NOT NULL
         AND s.weight IS NOT NULL
       ORDER BY s.completed_at ASC`,
    [userId, exerciseId],
  );
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.weight == null || !r.achieved_at) continue;
    // Convert into the display unit so a mixed-unit history charts on one axis.
    const w = convertWeight(r.weight, r.units ?? DEFAULT_UNITS, units);
    // Bucket by LOCAL calendar day, not a UTC slice — otherwise an evening lift
    // lands on the wrong day and one workout can split across two points (#149).
    const key = localDayKey(r.achieved_at);
    const prev = seen.get(key) ?? 0;
    if (w > prev) seen.set(key, w);
  }
  return Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, weight]) => ({ achievedAt, weight: Math.round(weight * 10) / 10 }));
}

export type RepsPoint = { achievedAt: string; reps: number };

/**
 * Best single-set reps per LOCAL calendar day for one exercise — the chart
 * series behind the "Reps" metric, and the only one a bodyweight-only
 * exercise can plot. Mirrors the other series' filters (completed sets from
 * FINISHED workouts, soft-delete guards, local-day bucketing #149); loaded
 * sets count too, matching most_reps record semantics. No unit conversion —
 * reps are reps.
 */
export async function getMostRepsHistory(userId: string, exerciseId: string): Promise<RepsPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ achieved_at: string; reps: number | null }>(
    `SELECT s.completed_at AS achieved_at, s.reps AS reps
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND we.exercise_id = ?
         AND s.completed = 1 AND s.deleted_at IS NULL
         AND we.deleted_at IS NULL AND w.deleted_at IS NULL
         AND w.ended_at IS NOT NULL
         AND s.reps IS NOT NULL
       ORDER BY s.completed_at ASC`,
    [userId, exerciseId],
  );
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.reps == null || !r.achieved_at) continue;
    const key = localDayKey(r.achieved_at);
    const prev = seen.get(key) ?? 0;
    if (r.reps > prev) seen.set(key, r.reps);
  }
  return Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, reps]) => ({ achievedAt, reps }));
}

export type VolumePoint = { achievedAt: string; volume: number };

/**
 * Best single-set volume (weight × reps) per LOCAL calendar day for one exercise.
 * Mirrors getHeaviestWeightHistory: canonical math is done in the display unit so
 * a mixed-unit history charts on one axis, the value is bucketed by local day so
 * an evening lift doesn't split across two points (#149), and only completed sets
 * from non-deleted rows count.
 */
export async function getBestSetVolumeHistory(
  userId: string,
  exerciseId: string,
  units: Units = DEFAULT_UNITS,
): Promise<VolumePoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    achieved_at: string;
    weight: number | null;
    reps: number | null;
    units: Units | null;
  }>(
    `SELECT s.completed_at AS achieved_at, s.weight AS weight, s.reps AS reps, s.units AS units
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND we.exercise_id = ?
         AND s.completed = 1 AND s.deleted_at IS NULL
         AND we.deleted_at IS NULL AND w.deleted_at IS NULL
         AND w.ended_at IS NOT NULL
         AND s.weight IS NOT NULL AND s.reps IS NOT NULL
       ORDER BY s.completed_at ASC`,
    [userId, exerciseId],
  );
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.weight == null || r.reps == null || !r.achieved_at) continue;
    const vol = convertWeight(r.weight, r.units ?? DEFAULT_UNITS, units) * r.reps;
    const key = localDayKey(r.achieved_at);
    const prev = seen.get(key) ?? 0;
    if (vol > prev) seen.set(key, vol);
  }
  return Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, volume]) => ({ achievedAt, volume: Math.round(volume * 10) / 10 }));
}
