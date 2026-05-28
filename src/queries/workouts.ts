/**
 * Workout queries + mutations against local SQLite.
 *
 * Reads return deleted_at IS NULL rows only; writes go through the outbox.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Workout } from '@/db/types';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';
import { compositionTitle } from '@/lib/compositionTitle';
import { dayOfWeek } from '@/lib/dayOfWeek';

import { queryKeys } from './keys';

export async function getActiveWorkout(userId: string): Promise<Workout | null> {
  const db = await getDb();
  return db.getFirstAsync<Workout>(
    `SELECT * FROM workouts
       WHERE user_id = ? AND ended_at IS NULL AND deleted_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
    [userId],
  );
}

export async function getRecentWorkouts(userId: string, limit = 10): Promise<Workout[]> {
  const db = await getDb();
  return db.getAllAsync<Workout>(
    `SELECT * FROM workouts
       WHERE user_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY started_at DESC LIMIT ?`,
    [userId, limit],
  );
}

export function useActiveWorkout(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.workouts.active(userId) : ['workouts', 'active', 'none'],
    queryFn: () => (userId ? getActiveWorkout(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

export function useRecentWorkouts(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: userId ? queryKeys.workouts.recent(userId) : ['workouts', 'recent', 'none'],
    queryFn: () => (userId ? getRecentWorkouts(userId, limit) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export async function createWorkout(args: {
  userId: string;
  title?: string;
  templateId?: string | null;
}): Promise<string> {
  const id = uuidv4();
  const startedAt = nowIso();
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId: id,
    payload: {
      user_id: args.userId,
      started_at: startedAt,
      title: args.title ?? dayOfWeek(startedAt),
      template_id: args.templateId ?? null,
      ended_at: null,
    },
  });
  void triggerPush();
  return id;
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { ended_at: nowIso() },
  });
  void triggerPush();
}

export async function updateWorkoutTitle(workoutId: string, title: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { title },
  });
  void triggerPush();
}

/**
 * Phase 4: when a workout reaches 3+ exercises and the title is still the
 * default day-of-week, derive a composition title from the exercises'
 * muscle groups and update once. After this, the title is no longer the
 * default so subsequent adds short-circuit and never overwrite.
 */
export async function maybeUpdateAutoTitle(workoutId: string): Promise<void> {
  const db = await getDb();
  const workout = await db.getFirstAsync<{ title: string; started_at: string }>(
    'SELECT title, started_at FROM workouts WHERE id = ? AND deleted_at IS NULL',
    [workoutId],
  );
  if (!workout) return;

  // Only auto-update when title is still the day-of-week default
  if (workout.title !== dayOfWeek(workout.started_at)) return;

  const rows = await db.getAllAsync<{ muscle_group: string | null }>(
    `SELECT e.muscle_group
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       WHERE we.workout_id = ? AND we.deleted_at IS NULL
       ORDER BY we.order_index ASC`,
    [workoutId],
  );

  if (rows.length < 3) return;

  const composed = compositionTitle(rows.map((r) => r.muscle_group));
  if (composed === '' || composed === workout.title) return;

  await updateWorkoutTitle(workoutId, composed);
}

export async function deleteWorkoutLocal(workoutId: string): Promise<void> {
  await enqueueMutation({ table: 'workouts', op: 'delete', rowId: workoutId });
  void triggerPush();
}

export function useCreateWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkout,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to create workout'),
  });
}

export function useFinishWorkout(userId: string | undefined, onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: finishWorkout,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      if (userId) qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
    },
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to finish workout'),
  });
}

export function useUpdateWorkoutTitle(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { workoutId: string; title: string }) =>
      updateWorkoutTitle(args.workoutId, args.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to rename workout'),
  });
}
