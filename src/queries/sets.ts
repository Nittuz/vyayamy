/**
 * Set mutations against local SQLite. Every change commits immediately
 * and enqueues a sync operation. No optimistic-update / rollback logic
 * is needed — the local write IS the source of truth.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { appendOutbox, enqueueMutation, upsertRowLocal } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import type { Set as SetRow } from '@/db/types';
import { nowIso, uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';
import { planFirstSet, type StagedSetPlan } from '@/components/activeSet';

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

export async function addSet(
  weId: string,
  args: { weight?: number | null; reps?: number | null; units?: 'kg' | 'lb' | null } = {},
): Promise<string> {
  const db = await getDb();
  const id = uuidv4();
  // NOT converted to enqueueMutation on purpose: the COALESCE(MAX(order_index),
  // -1) + 1 read must run inside the SAME transaction as the insert so two
  // rapid taps cannot both read MAX=N and write duplicate order_index = N+1.
  // enqueueMutation opens its own transaction and cannot host that read.
  await withTransaction(db, async () => {
    const result = await db.getFirstAsync<{ next_order: number }>(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
         FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL`,
      [weId],
    );
    const nextOrder = result?.next_order ?? 0;
    await upsertRowLocal(db, 'sets', {
      id,
      workout_exercise_id: weId,
      order_index: nextOrder,
      weight: args.weight ?? null,
      reps: args.reps ?? null,
      units: args.units ?? null,
      completed: 0,
      completed_at: null,
      updated_at: nowIso(),
    });
    await appendOutbox(db, 'sets', 'insert', id, {
      id,
      workout_exercise_id: weId,
      order_index: nextOrder,
      weight: args.weight ?? null,
      reps: args.reps ?? null,
      units: args.units ?? null,
      completed: false,
      completed_at: null,
    });
  });
  emitMutationCommitted();
  return id;
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<SetRow, 'weight' | 'reps' | 'completed' | 'units'>>,
): Promise<void> {
  const merged: Record<string, unknown> = { ...patch };
  if (patch.completed === true) merged.completed_at = nowIso();
  if (patch.completed === false) merged.completed_at = null;
  await enqueueMutation({ table: 'sets', op: 'update', rowId: setId, payload: merged });
  emitMutationCommitted();
}

export async function deleteSet(setId: string): Promise<void> {
  await enqueueMutation({ table: 'sets', op: 'delete', rowId: setId });
  emitMutationCommitted();
}

// Lazy import keeps expo-constants (ESM) off the jest module graph — same
// idiom as plans.ts / exercises.ts / db/client.ts.
function reportMutationError(err: unknown, mutation: string): void {
  void import('@/lib/errorReporting').then(({ captureException }) =>
    captureException(err, { mutation }),
  );
}

export function useUpdateSet(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      setId: string;
      weId: string;
      patch: Partial<Pick<SetRow, 'weight' | 'reps' | 'completed' | 'units'>>;
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
      reportMutationError(err, 'updateSet');
      onError?.("Couldn't save the set. Try again.");
    },
    onSettled: (_r, _err, vars) => invalidateSetWrite(qc, vars.weId),
  });
}

export function useDeleteSet(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { setId: string; weId: string }) => deleteSet(args.setId),
    onSuccess: (_r, vars) => invalidateSetWrite(qc, vars.weId),
    onError: (err) => {
      reportMutationError(err, 'deleteSet');
      onError?.("Couldn't delete the set. Try again.");
    },
  });
}

interface LastSessionSetRow {
  order_index: number;
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

/**
 * Completed sets of the most recent FINISHED workout containing this exercise,
 * in performed order — the never-empty prefill source (spec §2). Pattern
 * follows getHeaviestWeightHistory in personalRecords.ts. planFirstSet's
 * `lastSets[0]` contract depends on the ORDER BY order_index ASC here.
 *
 * Pinned to ONE workout_exercise id (the LAST block of the exercise in that
 * workout): a workout can hold the same exercise in two blocks, each with its
 * own order_index sequence, and filtering by workout+exercise would interleave
 * them and break the "first performed set" contract.
 */
export async function getLastSessionSets(
  userId: string,
  exerciseId: string,
): Promise<LastSessionSetRow[]> {
  const db = await getDb();
  const last = await db.getFirstAsync<{ we_id: string }>(
    `SELECT we.id AS we_id
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN sets s ON s.workout_exercise_id = we.id
      WHERE w.user_id = ? AND we.exercise_id = ?
        AND w.ended_at IS NOT NULL AND s.completed = 1
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
      ORDER BY w.ended_at DESC, we.order_index DESC
      LIMIT 1`,
    [userId, exerciseId],
  );
  if (!last) return [];
  return db.getAllAsync<LastSessionSetRow>(
    `SELECT order_index, weight, reps, units
       FROM sets
      WHERE workout_exercise_id = ? AND completed = 1 AND deleted_at IS NULL
      ORDER BY order_index ASC`,
    [last.we_id],
  );
}

export interface FirstSetStage {
  setId: string;
  plan: StagedSetPlan;
  /** True when the plan carries last-session values (drives LAST TIME + autoStaged). */
  fromHistory: boolean;
}

/**
 * Stage the FIRST set of an exercise, prefilled from history (spec §2).
 * History lookup failures degrade to an empty stage — staging must never
 * block on a bad read.
 */
export async function stageFirstSet(
  weId: string,
  exerciseId: string,
  ctx: { userId: string; units: 'kg' | 'lb'; weightStep: number },
): Promise<FirstSetStage> {
  let plan: StagedSetPlan = { weight: null, reps: null, units: null };
  try {
    const rows = await getLastSessionSets(ctx.userId, exerciseId);
    plan = planFirstSet(
      rows.map((r) => ({
        orderIndex: r.order_index,
        weight: r.weight,
        reps: r.reps,
        units: r.units,
      })),
      ctx.units,
      ctx.weightStep,
    );
  } catch (err) {
    // Prefill is best-effort — a bad read must not block staging (spec §2),
    // but it must not vanish either.
    reportMutationError(err, 'stageFirstSet');
  }
  const setId = await addSet(weId, plan);
  return { setId, plan, fromHistory: plan.weight != null || plan.reps != null };
}
