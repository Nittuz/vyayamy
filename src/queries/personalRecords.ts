import { useQuery } from '@tanstack/react-query';

import { computeBestMetrics, detectNewPRs } from '@/core/pr-detection';
import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { nowIso, uuidv4 } from '@/db/uuid';
import { parsePRValue, type GroupedPR } from '@/core/domain';
import type { Exercise, PersonalRecord } from '@/db/types';

import { queryKeys } from './keys';

interface Row extends PersonalRecord {
  exercise_name: string | null;
  muscle_group: string | null;
}

/**
 * Recompute an exercise's all-time PRs from every completed set the user has
 * logged for it, and upsert only genuine improvements over the stored records.
 * Writes go through the outbox like any other mutation.
 */
async function upsertExercisePRs(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  exerciseId: string,
  workoutId: string | null,
): Promise<void> {
  const sets = await db.getAllAsync<{ weight: number | null; reps: number | null; completed: number }>(
    `SELECT s.weight, s.reps, s.completed
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND we.exercise_id = ?
        AND s.completed = 1 AND s.deleted_at IS NULL
        AND we.deleted_at IS NULL AND w.deleted_at IS NULL`,
    [userId, exerciseId],
  );

  const metrics = computeBestMetrics(sets.map((s) => ({ ...s, completed: Boolean(s.completed) })));

  const existing = await db.getAllAsync<{ id: string; type: string; value: string }>(
    `SELECT id, type, value FROM personal_records
      WHERE user_id = ? AND exercise_id = ? AND deleted_at IS NULL`,
    [userId, exerciseId],
  );
  const existingIdByType = new Map(existing.map((r) => [r.type, r.id]));
  const existingValueByType = new Map(existing.map((r) => [r.type, decodePRValue(r.value)]));

  const candidates = detectNewPRs(metrics, existingValueByType);
  const now = nowIso();

  for (const c of candidates) {
    const value = JSON.stringify(c.value);
    const id = existingIdByType.get(c.type);
    if (id) {
      await enqueueMutation({
        table: 'personal_records',
        op: 'update',
        rowId: id,
        payload: { value, achieved_at: now, workout_id: workoutId },
      });
    } else {
      await enqueueMutation({
        table: 'personal_records',
        op: 'insert',
        rowId: uuidv4(),
        payload: {
          user_id: userId,
          exercise_id: exerciseId,
          type: c.type,
          value,
          achieved_at: now,
          ...(workoutId ? { workout_id: workoutId } : {}),
        },
      });
    }
  }
}

/**
 * Detect and persist personal records for every exercise in a finished workout.
 *
 * PR detection lives in `@/core/pr-detection` but was never wired into the app,
 * so `personal_records` stayed empty and Progress showed nothing. Runs on finish.
 */
export async function recordWorkoutPRs(userId: string, workoutId: string): Promise<void> {
  const db = await getDb();
  const exerciseRows = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT exercise_id FROM workout_exercises
       WHERE workout_id = ? AND deleted_at IS NULL`,
    [workoutId],
  );
  for (const { exercise_id } of exerciseRows) {
    await upsertExercisePRs(db, userId, exercise_id, workoutId);
  }
}

/**
 * One-time backfill: recompute PRs across every exercise the user has ever
 * completed a set for. Lets existing history surface PRs without re-finishing
 * old workouts. Idempotent — only writes improvements.
 */
export async function recomputeAllPRs(userId: string): Promise<void> {
  const db = await getDb();
  const exerciseRows = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT we.exercise_id
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE w.user_id = ? AND s.completed = 1
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL`,
    [userId],
  );
  for (const { exercise_id } of exerciseRows) {
    await upsertExercisePRs(db, userId, exercise_id, null);
  }
}

/** Postgres ships `value` as JSONB; SQLite stores the JSON as TEXT. Decode here. */
function decodePRValue(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatDisplay(type: string, value: unknown): string {
  const decoded = decodePRValue(value);
  const parsed = parsePRValue(type, decoded as never);
  if (!parsed) return String(decoded);
  switch (parsed.type) {
    case 'heaviest_weight':
      return `${parsed.value}`;
    case 'best_volume':
      return `${parsed.value}`;
    case 'most_reps_at_weight':
      return `${parsed.value.reps} × ${parsed.value.weight}`;
  }
}

type GroupedPRItem = GroupedPR extends { records: Array<infer R> } ? R : never;

export async function getGroupedPRs(userId: string): Promise<GroupedPR[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT pr.*, ex.name AS exercise_name, ex.muscle_group AS muscle_group
       FROM personal_records pr
       LEFT JOIN exercises ex ON ex.id = pr.exercise_id
       WHERE pr.user_id = ? AND pr.deleted_at IS NULL
       ORDER BY pr.achieved_at DESC`,
    [userId],
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
    const rec: GroupedPRItem = {
      id: r.id,
      type: r.type as GroupedPRItem['type'],
      displayValue: formatDisplay(r.type, r.value),
      achievedAt: r.achieved_at,
      isRecent,
    };
    bucket.records.push(rec);
    if (isRecent) bucket.hasRecent = true;
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.exerciseName.localeCompare(b.exerciseName),
  );
}

export function useGroupedPRs(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.personalRecords(userId) : ['personal_records', 'none'],
    queryFn: () => (userId ? getGroupedPRs(userId) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export type WeightPoint = { achievedAt: string; weight: number };

export async function getHeaviestWeightHistory(
  userId: string,
  exerciseId: string,
): Promise<WeightPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    achieved_at: string;
    weight: number | null;
    reps: number | null;
  }>(
    `SELECT s.completed_at AS achieved_at, s.weight AS weight, s.reps AS reps
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND we.exercise_id = ?
         AND s.completed = 1 AND s.deleted_at IS NULL AND w.deleted_at IS NULL
         AND s.weight IS NOT NULL
       ORDER BY s.completed_at ASC`,
    [userId, exerciseId],
  );
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.weight == null || !r.achieved_at) continue;
    const key = r.achieved_at.slice(0, 10);
    const prev = seen.get(key) ?? 0;
    if (r.weight > prev) seen.set(key, r.weight);
  }
  return Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, weight]) => ({ achievedAt, weight }));
}
