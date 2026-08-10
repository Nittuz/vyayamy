/**
 * Quick log (spec 2026-08-09-quick-log): one exercise, minimal ceremony.
 *
 * Creates a workout titled after the picked exercise, adds the exercise
 * through the existing addExerciseToWorkout funnel, and returns the ids —
 * the caller navigates to the normal active-workout screen, so history,
 * PRs, notes, voice, and sync all work unchanged.
 *
 * The staged first set starts EMPTY (not history-prefilled): prefill needs a
 * staged marker registered with the workout screen's cursor (#12), and quick
 * log runs before that screen mounts — the same constraint that makes
 * voice-added exercises stage empty (e6c7e71).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { createWorkout, deleteWorkoutLocal } from '@/queries/workouts';

import { queryKeys } from './keys';

export async function startQuickLog(args: {
  userId: string;
  exerciseId: string;
}): Promise<{ workoutId: string; weId: string }> {
  const db = await getDb();
  const ex = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM exercises WHERE id = ? AND deleted_at IS NULL',
    [args.exerciseId],
  );
  const title = ex?.name?.trim() ? ex.name.trim() : undefined; // undefined → day-of-week default
  const workoutId = await createWorkout({ userId: args.userId, title });
  try {
    const { weId } = await addExerciseToWorkout({
      workoutId,
      exerciseId: args.exerciseId,
    });
    return { workoutId, weId };
  } catch (err) {
    // Compensating delete: the two steps commit in separate transactions, and
    // a failure after the first would strand an EMPTY active workout that
    // disables both start buttons (one-active invariant) — review finding.
    await deleteWorkoutLocal(workoutId).catch(() => undefined);
    throw err;
  }
}

export function useQuickLog(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startQuickLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      void import('@/lib/errorReporting').then(({ captureException }) =>
        captureException(err, { mutation: 'startQuickLog' }),
      );
      onError?.('Could not start the quick log. Please try again.');
    },
  });
}
