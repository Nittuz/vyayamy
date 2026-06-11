/**
 * Repeat-last-workout — reads the user's most recent finished workout
 * and produces (a) a summary for the Today Repeat card, and (b) a
 * mutation that clones the workout's exercises with one pre-seeded set
 * per exercise (weight + reps from the most recent COMPLETED set).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { withTransaction } from '@/db/transaction';
import { nowIso, uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';

import { queryKeys } from './keys';

export interface ExerciseSeed {
  exerciseId: string;
  exerciseName: string;
  seedWeight: number | null;
  seedReps: number | null;
  seedUnits: 'kg' | 'lb' | null;
}

export interface LastWorkoutWithSeeds {
  workout: {
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  };
  seeds: ExerciseSeed[];
}

export async function getLastFinishedWorkoutWithSeeds(
  userId: string,
): Promise<LastWorkoutWithSeeds | null> {
  const db = await getDb();
  const workout = await db.getFirstAsync<{
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  }>(
    `SELECT id, title, started_at, ended_at FROM workouts
       WHERE user_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY ended_at DESC LIMIT 1`,
    [userId],
  );
  if (!workout) return null;

  const exerciseRows = await db.getAllAsync<{
    we_id: string;
    exercise_id: string;
    exercise_name: string;
    order_index: number;
  }>(
    `SELECT we.id AS we_id, we.exercise_id, e.name AS exercise_name, we.order_index
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
      WHERE we.workout_id = ? AND we.deleted_at IS NULL
      ORDER BY we.order_index`,
    [workout.id],
  );

  const seeds: ExerciseSeed[] = [];
  for (const row of exerciseRows) {
    const lastSet = await db.getFirstAsync<{
      weight: number | null;
      reps: number | null;
      units: 'kg' | 'lb' | null;
    }>(
      `SELECT weight, reps, units FROM sets
         WHERE workout_exercise_id = ? AND completed = 1 AND deleted_at IS NULL
         ORDER BY order_index DESC LIMIT 1`,
      [row.we_id],
    );
    seeds.push({
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      seedWeight: lastSet?.weight ?? null,
      seedReps: lastSet?.reps ?? null,
      // Carry provenance so a repeated set keeps the unit it was logged in.
      seedUnits: lastSet?.units ?? null,
    });
  }

  return { workout, seeds };
}

export function useLastFinishedWorkoutWithSeeds(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.workouts.all, 'last-finished', userId]
      : ['workouts', 'last-finished', 'none'],
    queryFn: () => (userId ? getLastFinishedWorkoutWithSeeds(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

function toSqlite(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** Insert a row + its outbox entry directly, WITHOUT opening a transaction, so
 *  the caller can batch the whole clone into one (mirrors enqueueMutation's
 *  insert branch). */
async function insertRowInTx(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  rowId: string,
  payload: Record<string, unknown>,
  now: string,
): Promise<void> {
  const full: Record<string, unknown> = { id: rowId, updated_at: now, ...payload };
  const cols = Object.keys(full);
  const placeholders = cols.map(() => '?').join(', ');
  const updateAssign = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
    cols.map((c) => toSqlite(full[c])),
  );
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, 'insert', ?, ?)`,
    [table, rowId, JSON.stringify({ id: rowId, ...payload })],
  );
}

export async function repeatLastWorkout(userId: string): Promise<string | null> {
  const source = await getLastFinishedWorkoutWithSeeds(userId);
  if (!source) return null;

  const db = await getDb();
  const newWorkoutId = uuidv4();
  const now = nowIso();

  // Clone the whole workout (workout + exercises + seeded sets + their outbox
  // rows) in ONE transaction, so a crash mid-clone can't leave a half-built —
  // possibly empty — active workout behind (#20).
  await withTransaction(db, async () => {
    await insertRowInTx(db, 'workouts', newWorkoutId, {
      user_id: userId,
      started_at: now,
      title: source.workout.title,
      template_id: null,
      ended_at: null,
    }, now);

    for (const [i, seed] of source.seeds.entries()) {
      const weId = uuidv4();
      await insertRowInTx(db, 'workout_exercises', weId, {
        workout_id: newWorkoutId,
        exercise_id: seed.exerciseId,
        order_index: i,
      }, now);

      await insertRowInTx(db, 'sets', uuidv4(), {
        workout_exercise_id: weId,
        order_index: 0,
        weight: seed.seedWeight,
        reps: seed.seedReps,
        units: seed.seedUnits,
        completed: 0,
        completed_at: null,
      }, now);
    }
  });

  emitMutationCommitted();
  return newWorkoutId;
}

export function useRepeatLastWorkout(userId: string | undefined, onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Not signed in');
      return repeatLastWorkout(userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to repeat workout'),
  });
}
