/**
 * Exercise catalog queries + workout_exercise mutations.
 * The exercises table holds the union of global (user_id NULL) and
 * user-owned rows. Global rows arrive via incremental pull; custom
 * rows are created locally and pushed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Exercise } from '@/db/types';
import { uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import { queryKeys } from './keys';

export async function searchExercises(userId: string, query: string, limit = 50): Promise<Exercise[]> {
  const db = await getDb();
  const like = `%${query.trim()}%`;
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises
       WHERE deleted_at IS NULL
         AND (user_id IS NULL OR user_id = ?)
         AND (? = '' OR LOWER(name) LIKE LOWER(?))
       ORDER BY name ASC LIMIT ?`,
    [userId, query.trim(), like, limit],
  );
}

export function useExercisesSearch(userId: string | undefined, query: string) {
  return useQuery({
    queryKey: userId ? queryKeys.exercises.search(query) : ['exercises', 'search', 'none'],
    queryFn: () => (userId ? searchExercises(userId, query) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export async function createCustomExercise(args: {
  userId: string;
  name: string;
  muscleGroup?: string | null;
}): Promise<string> {
  const id = uuidv4();
  await enqueueMutation({
    table: 'exercises',
    op: 'insert',
    rowId: id,
    payload: {
      name: args.name,
      muscle_group: args.muscleGroup ?? null,
      user_id: args.userId,
    },
  });
  void triggerPush();
  return id;
}

export async function addExerciseToWorkout(args: {
  workoutId: string;
  exerciseId: string;
}): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ order_index: number }>(
    'SELECT order_index FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL',
    [args.workoutId],
  );
  const nextOrder = rows.reduce((m, r) => Math.max(m, r.order_index), -1) + 1;
  const id = uuidv4();
  await enqueueMutation({
    table: 'workout_exercises',
    op: 'insert',
    rowId: id,
    payload: {
      workout_id: args.workoutId,
      exercise_id: args.exerciseId,
      order_index: nextOrder,
    },
  });
  void triggerPush();
  return id;
}

export function useCreateCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCustomExercise,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exercises.all }),
  });
}

export function useAddExerciseToWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addExerciseToWorkout,
    onSuccess: (_id, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.workouts.withExercises(vars.workoutId) }),
  });
}
