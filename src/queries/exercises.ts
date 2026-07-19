/**
 * Exercise catalog queries + workout_exercise mutations.
 * The exercises table holds the union of global (user_id NULL) and
 * user-owned rows. Global rows arrive via incremental pull; custom
 * rows are created locally and pushed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { appendOutbox, enqueueMutation, upsertRowLocal } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import type { Exercise } from '@/db/types';
import { uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';
import { addSet, stageFirstSet, type FirstSetStage } from '@/queries/sets';

import { maybeUpdateAutoTitle } from './workouts';
import { queryKeys } from './keys';

export async function searchExercises(
  userId: string,
  query: string,
  limit = 50,
): Promise<Exercise[]> {
  const db = await getDb();
  const trimmed = query.trim();
  if (trimmed !== '') {
    // Active search: the user is typing a specific name — alphabetical is the
    // predictable order.
    return db.getAllAsync<Exercise>(
      `SELECT * FROM exercises
         WHERE deleted_at IS NULL
           AND (user_id IS NULL OR user_id = ?)
           AND LOWER(name) LIKE LOWER(?)
         ORDER BY name ASC LIMIT ?`,
      [userId, `%${trimmed}%`, limit],
    );
  }
  // Browse (empty query): a lifter mid-session wants their staples, not the
  // alphabet — rank by how often THIS user has logged each exercise.
  return db.getAllAsync<Exercise>(
    `SELECT e.* FROM exercises e
       LEFT JOIN (
         SELECT we.exercise_id, COUNT(*) AS uses
           FROM workout_exercises we
           JOIN workouts w ON w.id = we.workout_id
             AND w.user_id = ? AND w.deleted_at IS NULL
          WHERE we.deleted_at IS NULL
          GROUP BY we.exercise_id
       ) u ON u.exercise_id = e.id
       WHERE e.deleted_at IS NULL
         AND (e.user_id IS NULL OR e.user_id = ?)
       ORDER BY COALESCE(u.uses, 0) DESC, e.name ASC LIMIT ?`,
    [userId, userId, limit],
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
  emitMutationCommitted();
  return id;
}

export async function addExerciseToWorkout(args: {
  workoutId: string;
  exerciseId: string;
  /** When present, the auto-staged first set is prefilled from history (spec §2). */
  prefill?: { userId: string; units: 'kg' | 'lb'; weightStep: number };
}): Promise<{ weId: string; staged: FirstSetStage | null }> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  // Compute next order_index inside the same transaction as the insert so two
  // rapid taps cannot both read MAX=N and write duplicate order_index = N+1.
  await withTransaction(db, async () => {
    const result = await db.getFirstAsync<{ next_order: number }>(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
         FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL`,
      [args.workoutId],
    );
    const nextOrder = result?.next_order ?? 0;
    await upsertRowLocal(db, 'workout_exercises', {
      id,
      workout_id: args.workoutId,
      exercise_id: args.exerciseId,
      order_index: nextOrder,
      updated_at: now,
    });
    await appendOutbox(db, 'workout_exercises', 'insert', id, {
      id,
      workout_id: args.workoutId,
      exercise_id: args.exerciseId,
      order_index: nextOrder,
    });
  });
  emitMutationCommitted();
  // Phase 3: every exercise starts with one set staged so the user never
  // sees an empty card — now prefilled from history (spec §2).
  let staged: FirstSetStage | null = null;
  if (args.prefill) {
    staged = await stageFirstSet(id, args.exerciseId, args.prefill);
  } else {
    await addSet(id);
  }
  return { weId: id, staged };
}

// Raw driver text stays out of the UI (backlog 8.5): callers get friendly
// copy, Sentry gets the real error. Dynamic import keeps pure-TS jest suites
// from loading expo-constants (db/client.ts precedent).
function reportMutationError(err: unknown, mutation: string): void {
  void import('@/lib/errorReporting').then(({ captureException }) =>
    captureException(err, { mutation }),
  );
}

export function useCreateCustomExercise(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCustomExercise,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exercises.all }),
    onError: (err) => {
      reportMutationError(err, 'createCustomExercise');
      onError?.("Couldn't create the exercise. Try again.");
    },
  });
}

export function useAddExerciseToWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addExerciseToWorkout,
    onSuccess: async (_id, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts.withExercises(vars.workoutId) });
      // Phase 4: maybe-update title once we have 3+ exercises and the
      // title is still the day-of-week default
      await maybeUpdateAutoTitle(vars.workoutId);
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (err) => {
      reportMutationError(err, 'addExerciseToWorkout');
      onError?.("Couldn't add the exercise. Try again.");
    },
  });
}
