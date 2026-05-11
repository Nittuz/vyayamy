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
    queryKey: userId
      ? queryKeys.exercises.search(userId, query)
      : ['exercises', 'search', 'none', query],
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
  const id = uuidv4();
  const now = new Date().toISOString();
  // Compute next order_index inside the same transaction as the insert so two
  // rapid taps cannot both read MAX=N and write duplicate order_index = N+1.
  await db.withTransactionAsync(async () => {
    const result = await db.getFirstAsync<{ next_order: number }>(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
         FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL`,
      [args.workoutId],
    );
    const nextOrder = result?.next_order ?? 0;
    const cols = ['id', 'workout_id', 'exercise_id', 'order_index', 'updated_at'];
    const values = [id, args.workoutId, args.exerciseId, nextOrder, now];
    const placeholders = cols.map(() => '?').join(', ');
    const updateAssign = cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    await db.runAsync(
      `INSERT INTO workout_exercises (${cols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
      values,
    );
    await db.runAsync(
      `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
      [
        'workout_exercises',
        'insert',
        id,
        JSON.stringify({
          id,
          workout_id: args.workoutId,
          exercise_id: args.exerciseId,
          order_index: nextOrder,
        }),
      ],
    );
  });
  void triggerPush();
  return id;
}

export function useCreateCustomExercise(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCustomExercise,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exercises.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to create exercise'),
  });
}

export function useAddExerciseToWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addExerciseToWorkout,
    onSuccess: (_id, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.workouts.withExercises(vars.workoutId) }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to add exercise'),
  });
}
