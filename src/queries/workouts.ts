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
import { recordWorkoutPRs } from '@/queries/personalRecords';
import { advanceCycleCursor } from '@/queries/plans';
import { emitMutationCommitted } from '@/db/mutationEvents';
import { compositionTitle } from '@/lib/compositionTitle';
import { dayOfWeek } from '@/lib/dayOfWeek';

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
  emitMutationCommitted();
  return id;
}

export async function finishWorkout(workoutId: string, userId?: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { ended_at: nowIso() },
  });

  // Soft-delete the workout's dangling incomplete sets (auto-staged "next set"
  // rows the user never filled) so they don't pollute history (#12).
  const db = await getDb();
  const incomplete = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
      WHERE we.workout_id = ? AND s.completed = 0
        AND s.deleted_at IS NULL AND we.deleted_at IS NULL`,
    [workoutId],
  );
  for (const s of incomplete) {
    await enqueueMutation({ table: 'sets', op: 'delete', rowId: s.id });
  }
  // Detect personal records from this workout's exercises before pushing, so the
  // PR rows ride the same sync cycle. Best-effort: a PR-detection failure must
  // not block finishing the workout.
  if (userId) {
    try {
      await recordWorkoutPRs(userId, workoutId);
    } catch (err) {
      // Finishing the workout is the critical path; a PR-detection failure
      // must not block it, but it must not vanish either (backlog 4.3).
      reportError(err, { workoutId, stage: 'recordWorkoutPRs' });
    }

    // Cycle-plan advancement (spec 2026-08-10): finishing the workout the
    // cursor points at moves the cycle forward. Same best-effort contract as
    // PR detection — never blocks finishing, never vanishes silently.
    try {
      const finished = await db.getFirstAsync<{ template_id: string | null }>(
        'SELECT template_id FROM workouts WHERE id = ?',
        [workoutId],
      );
      if (finished?.template_id) {
        await advanceCycleCursor(userId, { onlyIfCurrentTemplateId: finished.template_id });
      }
    } catch (err) {
      reportError(err, { workoutId, stage: 'advanceCycleCursor' });
    }
  }
  emitMutationCommitted();
}

async function updateWorkoutTitle(workoutId: string, title: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { title },
  });
  emitMutationCommitted();
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
  emitMutationCommitted();
}

// Toasts never carry raw err.message (backlog 8.5): internals like "fetch
// failed: hostname could not be found" are meaningless to the user. Friendly
// copy goes to the toast; the real error goes to error reporting.
export function useCreateWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkout,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      reportError(err, { mutation: 'createWorkout' });
      onError?.('Could not start the workout. Please try again.');
    },
  });
}

export function useFinishWorkout(userId: string | undefined, onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workoutId: string) => finishWorkout(workoutId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      if (userId) {
        qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
        qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
        // Finishing a scheduled cycle workout may have advanced the cursor.
        qc.invalidateQueries({ queryKey: ['plans'] });
      }
    },
    onError: (err) => {
      reportError(err, { mutation: 'finishWorkout' });
      onError?.('Could not finish the workout. Please try again.');
    },
  });
}

/** Normalize note input: trimmed text, or null when effectively empty. */
function normalizeNote(note: string | null): string | null {
  const trimmed = (note ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export async function setWorkoutNote(workoutId: string, note: string | null): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'update',
    rowId: workoutId,
    payload: { note: normalizeNote(note) },
  });
  emitMutationCommitted();
}

export async function setExerciseNote(weId: string, note: string | null): Promise<void> {
  await enqueueMutation({
    table: 'workout_exercises',
    op: 'update',
    rowId: weId,
    payload: { note: normalizeNote(note) },
  });
  emitMutationCommitted();
}

export function useSetWorkoutNote(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { workoutId: string; note: string | null }) =>
      setWorkoutNote(args.workoutId, args.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      reportError(err, { mutation: 'setWorkoutNote' });
      onError?.('Could not save the note. Please try again.');
    },
  });
}

export function useSetExerciseNote(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { weId: string; note: string | null }) =>
      setExerciseNote(args.weId, args.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      reportError(err, { mutation: 'setExerciseNote' });
      onError?.('Could not save the note. Please try again.');
    },
  });
}

export function useUpdateWorkoutTitle(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { workoutId: string; title: string }) =>
      updateWorkoutTitle(args.workoutId, args.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      reportError(err, { mutation: 'updateWorkoutTitle' });
      onError?.('Could not rename the workout. Please try again.');
    },
  });
}
