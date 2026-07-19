import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { addExerciseToWorkout, createCustomExercise, searchExercises } from '@/queries/exercises';
import { addSet, deleteSet, updateSet } from '@/queries/sets';

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
export async function dispatchCommand(
  command: Command,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  switch (command.kind) {
    case 'setValues': {
      if (!ctx.activeSetId) return { ok: false, message: 'No active set' };
      const db = await getDb();
      const prior = await db.getFirstAsync<{
        weight: number | null;
        reps: number | null;
        units: 'kg' | 'lb' | null;
      }>('SELECT weight, reps, units FROM sets WHERE id = ?', [ctx.activeSetId]);
      const patch: { weight?: number; reps?: number; units?: 'kg' | 'lb' } = {};
      if (command.weight != null) {
        patch.weight = command.weight;
        // A spoken unit ("100 kilos") overrides the profile preference; otherwise
        // the weight is logged in the profile's unit (#133).
        patch.units = command.unit ?? ctx.units;
      }
      if (command.reps != null) patch.reps = command.reps;
      await updateSet(ctx.activeSetId, patch);
      const setId = ctx.activeSetId;
      return {
        ok: true,
        message: `${command.weight ?? prior?.weight ?? '-'} × ${command.reps ?? prior?.reps ?? '-'}`,
        undo: async () => {
          await updateSet(setId, {
            weight: prior?.weight ?? null,
            reps: prior?.reps ?? null,
            units: prior?.units ?? null,
          });
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
      // Never-empty first set for voice adds too (spec §2) — prefilled from
      // the last session of this exercise.
      const { weId } = await addExerciseToWorkout({
        workoutId: ctx.workoutId,
        exerciseId,
        prefill: {
          userId: ctx.userId,
          units: ctx.units,
          weightStep: ctx.units === 'kg' ? 2.5 : 5,
        },
      });
      return {
        ok: true,
        message: `Added ${match ? match.name : command.name}`,
        undo: async () => {
          await enqueueMutation({ table: 'workout_exercises', op: 'delete', rowId: weId });
        },
      };
    }
    default:
      return { ok: false, message: 'Didn’t catch that' };
  }
}
