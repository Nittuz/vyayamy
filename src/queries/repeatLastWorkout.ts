/**
 * Repeat-last-workout — reads the user's most recent finished workout
 * and produces (a) a summary for the Today Repeat card, and (b) a
 * mutation that clones the workout's exercises with one pre-seeded set
 * per exercise (weight + reps from the most recent COMPLETED set).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { appendOutbox, upsertRowLocal } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import { nowIso, uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';

import { queryKeys } from './keys';

/**
 * Lazy import (db/client.ts precedent): errorReporting pulls in
 * expo-constants, which must not sit on the jest/node import path.
 */
function reportError(err: unknown, context: Record<string, unknown>): void {
  void import('@/lib/errorReporting').then(({ captureException }) =>
    captureException(err, context),
  );
}

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

/** Insert a row + its outbox entry directly, WITHOUT opening a transaction, so
 *  the caller can batch the whole clone into one (mirrors enqueueMutation's
 *  insert branch). Thin wrapper over the shared db/mutations helpers. */
async function insertRowInTx(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  rowId: string,
  payload: Record<string, unknown>,
  now: string,
): Promise<void> {
  await upsertRowLocal(db, table, { id: rowId, updated_at: now, ...payload });
  await appendOutbox(db, table, 'insert', rowId, { id: rowId, ...payload });
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
    await insertRowInTx(
      db,
      'workouts',
      newWorkoutId,
      {
        user_id: userId,
        started_at: now,
        title: source.workout.title,
        template_id: null,
        ended_at: null,
      },
      now,
    );

    for (const [i, seed] of source.seeds.entries()) {
      const weId = uuidv4();
      await insertRowInTx(
        db,
        'workout_exercises',
        weId,
        {
          workout_id: newWorkoutId,
          exercise_id: seed.exerciseId,
          order_index: i,
        },
        now,
      );

      await insertRowInTx(
        db,
        'sets',
        uuidv4(),
        {
          workout_exercise_id: weId,
          order_index: 0,
          weight: seed.seedWeight,
          reps: seed.seedReps,
          units: seed.seedUnits,
          completed: 0,
          completed_at: null,
        },
        now,
      );
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
    // Never surface raw err.message in the toast (backlog 8.5) — friendly copy
    // for the user, the real error to error reporting.
    onError: (err) => {
      reportError(err, { mutation: 'repeatLastWorkout' });
      onError?.('Could not repeat the workout. Please try again.');
    },
  });
}
