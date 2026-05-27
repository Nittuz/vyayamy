/**
 * Repeat-last-workout — reads the user's most recent finished workout
 * and produces (a) a summary for the Today Repeat card, and (b) a
 * mutation that clones the workout's exercises with one pre-seeded set
 * per exercise (weight + reps from the most recent COMPLETED set).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import { queryKeys } from './keys';

export interface ExerciseSeed {
  exerciseId: string;
  exerciseName: string;
  seedWeight: number | null;
  seedReps: number | null;
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
    const lastSet = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
      `SELECT weight, reps FROM sets
         WHERE workout_exercise_id = ? AND completed = 1 AND deleted_at IS NULL
         ORDER BY order_index DESC LIMIT 1`,
      [row.we_id],
    );
    seeds.push({
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      seedWeight: lastSet?.weight ?? null,
      seedReps: lastSet?.reps ?? null,
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

export async function repeatLastWorkout(userId: string): Promise<string | null> {
  const source = await getLastFinishedWorkoutWithSeeds(userId);
  if (!source) return null;

  // 1. Create the new workout (active — ended_at: null)
  const newWorkoutId = uuidv4();
  const startedAt = nowIso();
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId: newWorkoutId,
    payload: {
      user_id: userId,
      started_at: startedAt,
      title: source.workout.title,
      template_id: null,
      ended_at: null,
    },
  });

  // 2. For each exercise seed, create workout_exercise + one seeded set
  for (const [i, seed] of source.seeds.entries()) {
    const weId = uuidv4();
    await enqueueMutation({
      table: 'workout_exercises',
      op: 'insert',
      rowId: weId,
      payload: {
        workout_id: newWorkoutId,
        exercise_id: seed.exerciseId,
        order_index: i,
      },
    });

    const setId = uuidv4();
    await enqueueMutation({
      table: 'sets',
      op: 'insert',
      rowId: setId,
      payload: {
        workout_exercise_id: weId,
        order_index: 0,
        weight: seed.seedWeight,
        reps: seed.seedReps,
        completed: 0,
        completed_at: null,
      },
    });
  }

  void triggerPush();
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
