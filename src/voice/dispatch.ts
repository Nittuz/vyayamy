import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { addExerciseToWorkout, createCustomExercise, searchExercises } from '@/queries/exercises';
import { addSet, deleteSet, listSetsForWorkoutExercise, updateSet } from '@/queries/sets';

import type { Command } from './commands';

export interface DispatchContext {
  userId: string;
  workoutId: string;
  activeWeId: string | null;
  activeSetId: string | null;
  units: 'kg' | 'lb';
}

export interface DispatchResult {
  ok: boolean;
  message: string;
  undo?: () => Promise<void>;
}

/** Apply a data command via existing local-first mutations. Returns feedback + an undo. */
export async function dispatchCommand(command: Command, ctx: DispatchContext): Promise<DispatchResult> {
  switch (command.kind) {
    case 'setValues': {
      if (!ctx.activeSetId) return { ok: false, message: 'No active set' };
      const db = await getDb();
      const prior = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
        'SELECT weight, reps FROM sets WHERE id = ?',
        [ctx.activeSetId],
      );
      const patch: { weight?: number; reps?: number } = {};
      if (command.weight != null) patch.weight = command.weight;
      if (command.reps != null) patch.reps = command.reps;
      await updateSet(ctx.activeSetId, patch);
      const setId = ctx.activeSetId;
      return {
        ok: true,
        message: `${command.weight ?? prior?.weight ?? '—'} × ${command.reps ?? prior?.reps ?? '—'}`,
        undo: async () => {
          await updateSet(setId, { weight: prior?.weight ?? null, reps: prior?.reps ?? null });
        },
      };
    }
    case 'completeSet': {
      if (!ctx.activeSetId) return { ok: false, message: 'No active set' };
      const setId = ctx.activeSetId;
      await updateSet(setId, { completed: true });
      return {
        ok: true,
        message: 'Set complete',
        undo: async () => {
          await updateSet(setId, { completed: false });
        },
      };
    }
    case 'addSet': {
      if (!ctx.activeWeId) return { ok: false, message: 'No active exercise' };
      const newId = await addSet(ctx.activeWeId);
      return {
        ok: true,
        message: 'Set added',
        undo: async () => {
          await deleteSet(newId);
        },
      };
    }
    case 'addExercise': {
      const matches = await searchExercises(ctx.userId, command.name);
      const match =
        matches.find((e) => e.name.toLowerCase() === command.name.toLowerCase()) ?? matches[0];
      const exerciseId = match
        ? match.id
        : await createCustomExercise({ userId: ctx.userId, name: command.name });
      const weId = await addExerciseToWorkout({ workoutId: ctx.workoutId, exerciseId });
      return {
        ok: true,
        message: `Added ${match ? match.name : command.name}`,
        undo: async () => {
          await enqueueMutation({ table: 'workout_exercises', op: 'delete', rowId: weId });
        },
      };
    }
    default:
      return { ok: false, message: 'Not a data command' };
  }
}

/** Convenience for the session hook: a list of set IDs is occasionally needed for cursor math. */
export async function setsFor(weId: string) {
  return listSetsForWorkoutExercise(weId);
}
