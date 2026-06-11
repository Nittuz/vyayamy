/**
 * Set mutations against local SQLite. Every change commits immediately
 * and enqueues a sync operation. No optimistic-update / rollback logic
 * is needed — the local write IS the source of truth.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import type { Set as SetRow } from '@/db/types';
import { nowIso, uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import type { QueryClient } from '@tanstack/react-query';

import { queryKeys, setWriteInvalidationKeys } from './keys';

/**
 * Refresh every local reader of a set after a write — crucially the composite
 * workout-detail query that WorkoutActive/HistoryDetail render from — WITHOUT
 * waiting on a network push (deep-review #11). See setWriteInvalidationKeys.
 */
function invalidateSetWrite(qc: QueryClient, weId: string): void {
  for (const key of setWriteInvalidationKeys(weId)) {
    void qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
  }
}

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
  const id = uuidv4();
  // Compute next order_index inside the same transaction as the insert so two
  // rapid taps cannot both read MAX=N and write duplicate order_index = N+1.
  await withTransaction(db, async () => {
    const result = await db.getFirstAsync<{ next_order: number }>(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
         FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL`,
      [weId],
    );
    const nextOrder = result?.next_order ?? 0;
    const payload = {
      id,
      workout_exercise_id: weId,
      order_index: nextOrder,
      weight: args.weight ?? null,
      reps: args.reps ?? null,
      completed: 0,
      completed_at: null,
      updated_at: nowIso(),
    };
    const cols = Object.keys(payload);
    const placeholders = cols.map(() => '?').join(', ');
    const updateAssign = cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    const values = cols.map((c) => (payload as Record<string, unknown>)[c] ?? null);
    await db.runAsync(
      `INSERT INTO sets (${cols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
      values as (string | number | null)[],
    );
    await db.runAsync(
      `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
      [
        'sets',
        'insert',
        id,
        JSON.stringify({
          id,
          workout_exercise_id: weId,
          order_index: nextOrder,
          weight: args.weight ?? null,
          reps: args.reps ?? null,
          completed: false,
          completed_at: null,
        }),
      ],
    );
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

export function useAddSet(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { weId: string; weight?: number | null; reps?: number | null }) =>
      addSet(args.weId, args),
    onSuccess: (_id, vars) => invalidateSetWrite(qc, vars.weId),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to add set'),
  });
}

export function useUpdateSet(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      setId: string;
      weId: string;
      patch: Partial<Pick<SetRow, 'weight' | 'reps' | 'completed'>>;
    }) => updateSet(args.setId, args.patch),
    // Optimistic update — toggling a set is the hottest interaction in the app
    // and round-tripping through invalidate-then-refetch causes a visible
    // flicker on the row's success-soft background. The local SQLite write is
    // already synchronous; we mirror it in the React Query cache before the
    // mutation resolves to keep the UI tear-free.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: queryKeys.sets.byWorkoutExercise(vars.weId) });
      const prev = qc.getQueryData<SetRow[]>(queryKeys.sets.byWorkoutExercise(vars.weId));
      if (prev) {
        const next = prev.map((s) => {
          if (s.id !== vars.setId) return s;
          const merged: SetRow = { ...s, ...vars.patch } as SetRow;
          if (vars.patch.completed === true) merged.completed_at = nowIso();
          if (vars.patch.completed === false) merged.completed_at = null;
          return merged;
        });
        qc.setQueryData(queryKeys.sets.byWorkoutExercise(vars.weId), next);
      }
      return { prev };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.sets.byWorkoutExercise(vars.weId), ctx.prev);
      onError?.(err instanceof Error ? err.message : 'Failed to update set');
    },
    onSettled: (_r, _err, vars) => invalidateSetWrite(qc, vars.weId),
  });
}

export function useDeleteSet(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { setId: string; weId: string }) => deleteSet(args.setId),
    onSuccess: (_r, vars) => invalidateSetWrite(qc, vars.weId),
    onError: (err) => onError?.(err instanceof Error ? err.message : 'Failed to delete set'),
  });
}
