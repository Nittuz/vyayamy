/**
 * Workout queries + mutations against local SQLite.
 *
 * Reads return deleted_at IS NULL rows only; writes go through the
 * outbox. The returned hooks match the surface area of the legacy
 * src/lib/queries/workouts.ts as closely as possible so screens can
 * be ported with minimal rework.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Workout } from '@/db/types';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

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
      title: args.title ?? 'Workout',
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

export async function deleteWorkoutLocal(workoutId: string): Promise<void> {
  await enqueueMutation({ table: 'workouts', op: 'delete', rowId: workoutId });
  void triggerPush();
}

export function useCreateWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkout,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
  });
}

export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: finishWorkout,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
  });
}
