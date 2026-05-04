// TODO(phase-1): This file owns set CRUD plus useFinishWorkout, useDeleteWorkout,
// and exercise reorder — broader than the filename suggests. Consider extracting
// workout-lifecycle mutations into workouts.ts or a dedicated workoutActions.ts.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Set } from '../../types/database';
import { workoutsQueryKey, type WorkoutExerciseWithMeta } from './workouts';
import type { Workout } from '../../types/database';

type SetInsert = {
  workout_exercise_id: string;
  order_index: number;
  weight?: number | null;
  reps?: number | null;
  completed?: boolean;
};

export type SetUpdate = {
  weight?: number | null;
  reps?: number | null;
  completed?: boolean;
  completed_at?: string | null;
};

type WorkoutDetail = {
  workout: Workout;
  workoutExercises: WorkoutExerciseWithMeta[];
} | null;

function detailKey(workoutId: string | undefined) {
  return [...workoutsQueryKey(), 'detail', workoutId ?? ''];
}

export function useAddSet(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetInsert): Promise<Set> => {
      const { data, error } = await supabase
        .from('sets')
        .insert({
          workout_exercise_id: input.workout_exercise_id,
          order_index: input.order_index,
          weight: input.weight ?? null,
          reps: input.reps ?? null,
          completed: input.completed ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Set;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey(workoutId) });
      const previous = queryClient.getQueryData<WorkoutDetail>(detailKey(workoutId));
      if (previous) {
        const tempId = `temp-${crypto.randomUUID()}`;
        const optimisticSet: Set = {
          id: tempId,
          workout_exercise_id: input.workout_exercise_id,
          order_index: input.order_index,
          weight: input.weight ?? null,
          reps: input.reps ?? null,
          completed: input.completed ?? false,
          completed_at: null,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueryData<WorkoutDetail>(detailKey(workoutId), {
          ...previous,
          workoutExercises: previous.workoutExercises.map((we) =>
            we.id === input.workout_exercise_id
              ? { ...we, sets: [...we.sets, optimisticSet] }
              : we
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey(workoutId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(workoutId) });
    },
  });
}

export function useUpdateSet(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      setId,
      updates,
    }: {
      setId: string;
      updates: SetUpdate;
    }): Promise<Set> => {
      const { data, error } = await supabase
        .from('sets')
        .update(updates)
        .eq('id', setId)
        .select()
        .single();
      if (error) throw error;
      return data as Set;
    },
    onMutate: async ({ setId, updates }) => {
      await queryClient.cancelQueries({ queryKey: detailKey(workoutId) });
      const previous = queryClient.getQueryData<WorkoutDetail>(detailKey(workoutId));
      if (previous) {
        queryClient.setQueryData<WorkoutDetail>(detailKey(workoutId), {
          ...previous,
          workoutExercises: previous.workoutExercises.map((we) => ({
            ...we,
            sets: we.sets.map((s) =>
              s.id === setId ? { ...s, ...updates } : s
            ),
          })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey(workoutId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(workoutId) });
    },
  });
}

export function useDeleteSet(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (setId: string): Promise<void> => {
      const { error } = await supabase.from('sets').delete().eq('id', setId);
      if (error) throw error;
    },
    onMutate: async (setId) => {
      await queryClient.cancelQueries({ queryKey: detailKey(workoutId) });
      const previous = queryClient.getQueryData<WorkoutDetail>(detailKey(workoutId));
      if (previous) {
        queryClient.setQueryData<WorkoutDetail>(detailKey(workoutId), {
          ...previous,
          workoutExercises: previous.workoutExercises.map((we) => ({
            ...we,
            sets: we.sets.filter((s) => s.id !== setId),
          })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey(workoutId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(workoutId) });
    },
  });
}

export function useDeleteWorkout(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workoutId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('id', workoutId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useReorderExercise(workoutId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
      sourceIndex,
      targetIndex,
    }: {
      sourceId: string;
      targetId: string;
      sourceIndex: number;
      targetIndex: number;
    }): Promise<void> => {
      const [r1, r2] = await Promise.all([
        supabase
          .from('workout_exercises')
          .update({ order_index: targetIndex })
          .eq('id', sourceId),
        supabase
          .from('workout_exercises')
          .update({ order_index: sourceIndex })
          .eq('id', targetId),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
    },
    onMutate: async ({ sourceId, targetId }) => {
      await queryClient.cancelQueries({ queryKey: detailKey(workoutId) });
      const previous = queryClient.getQueryData<WorkoutDetail>(detailKey(workoutId));
      if (previous) {
        const exercises = [...previous.workoutExercises];
        const srcIdx = exercises.findIndex((we) => we.id === sourceId);
        const tgtIdx = exercises.findIndex((we) => we.id === targetId);
        if (srcIdx !== -1 && tgtIdx !== -1) {
          [exercises[srcIdx], exercises[tgtIdx]] = [exercises[tgtIdx], exercises[srcIdx]];
          queryClient.setQueryData<WorkoutDetail>(detailKey(workoutId), {
            ...previous,
            workoutExercises: exercises,
          });
        }
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey(workoutId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(workoutId) });
    },
  });
}

export function useFinishWorkout(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workoutId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const endedAt = new Date().toISOString();
      const { error } = await supabase
        .from('workouts')
        .update({ ended_at: endedAt })
        .eq('id', workoutId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_data, workoutId) => {
      queryClient.invalidateQueries({ queryKey: workoutsQueryKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(workoutId) });
    },
  });
}
