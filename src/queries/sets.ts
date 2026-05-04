/**
 * Set mutations against local SQLite. Every change commits immediately
 * and enqueues a sync operation. No optimistic-update / rollback logic
 * is needed — the local write IS the source of truth.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Set as SetRow } from '@/db/types';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import { queryKeys } from './keys';

export async function listSetsForWorkoutExercise(weId: string): Promise<SetRow[]> {
  const db = await getDb();
  return db.getAllAsync<SetRow>(
    `SELECT * FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL
       ORDER BY order_index ASC`,
    [weId],
  );
}

export async function addSet(weId: string, args: { weight?: number | null; reps?: number | null } = {}): Promise<string> {
  const db = await getDb();
  const existing = await db.getAllAsync<{ order_index: number }>(
    'SELECT order_index FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL',
    [weId],
  );
  const nextOrder = existing.reduce((m, r) => Math.max(m, r.order_index), -1) + 1;
  const id = uuidv4();
  await enqueueMutation({
    table: 'sets',
    op: 'insert',
    rowId: id,
    payload: {
      workout_exercise_id: weId,
      order_index: nextOrder,
      weight: args.weight ?? null,
      reps: args.reps ?? null,
      completed: false,
      completed_at: null,
    },
  });
  void triggerPush();
  return id;
}

export async function updateSet(setId: string, patch: Partial<Pick<SetRow, 'weight' | 'reps' | 'completed'>>): Promise<void> {
  const merged: Record<string, unknown> = { ...patch };
  if (patch.completed === true) merged.completed_at = nowIso();
  if (patch.completed === false) merged.completed_at = null;
  await enqueueMutation({ table: 'sets', op: 'update', rowId: setId, payload: merged });
  void triggerPush();
}

export async function deleteSet(setId: string): Promise<void> {
  await enqueueMutation({ table: 'sets', op: 'delete', rowId: setId });
  void triggerPush();
}

export function useAddSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { weId: string; weight?: number | null; reps?: number | null }) =>
      addSet(args.weId, args),
    onSuccess: (_id, vars) => qc.invalidateQueries({ queryKey: queryKeys.sets.byWorkoutExercise(vars.weId) }),
  });
}

export function useUpdateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      setId: string;
      weId: string;
      patch: Partial<Pick<SetRow, 'weight' | 'reps' | 'completed'>>;
    }) => updateSet(args.setId, args.patch),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: queryKeys.sets.byWorkoutExercise(vars.weId) }),
  });
}

export function useDeleteSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { setId: string; weId: string }) => deleteSet(args.setId),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: queryKeys.sets.byWorkoutExercise(vars.weId) }),
  });
}
