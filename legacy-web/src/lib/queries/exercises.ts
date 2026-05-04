import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Exercise } from '../../types/database';
import { workoutsQueryKey } from './workouts';

const EXERCISES_KEY = ['exercises'] as const;

export function useExercisesSearch(userId: string | undefined, query: string) {
  return useQuery({
    queryKey: [...EXERCISES_KEY, 'search', userId ?? '', query],
    queryFn: async (): Promise<Exercise[]> => {
      const q = query.trim();
      if (q.length === 0) return [];
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
    enabled: query.trim().length > 0,
  });
}

export function useRecentExerciseIds(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: [...EXERCISES_KEY, 'recentIds', userId ?? '', limit],
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('exercise_id')
        .order('created_at', { ascending: false })
        .limit(limit * 3);
      if (error) throw error;
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const row of (data ?? []) as { exercise_id: string }[]) {
        if (!seen.has(row.exercise_id)) {
          seen.add(row.exercise_id);
          ids.push(row.exercise_id);
          if (ids.length >= limit) break;
        }
      }
      return ids;
    },
    enabled: !!userId,
  });
}

export function useExercisesByIds(ids: string[]) {
  return useQuery({
    queryKey: [...EXERCISES_KEY, 'byIds', ids.sort().join(',')],
    queryFn: async (): Promise<Exercise[]> => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .in('id', ids);
      if (error) throw error;
      const byId = new Map((data ?? []).map((e: Exercise) => [e.id, e]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as Exercise[];
    },
    enabled: ids.length > 0,
  });
}

export function useGlobalExercises(limit = 20) {
  return useQuery({
    queryKey: [...EXERCISES_KEY, 'global', limit],
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .is('user_id', null)
        .order('name')
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
  });
}

export function useCreateExercise(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; muscle_group?: string | null }): Promise<Exercise> => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('exercises')

        .insert({
          name: input.name.trim(),
          muscle_group: input.muscle_group ?? null,
          user_id: userId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Exercise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXERCISES_KEY });
    },
  });
}

export function useAddExerciseToWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workoutId: wId,
      exerciseId,
      orderIndex,
    }: {
      workoutId: string;
      exerciseId: string;
      orderIndex: number;
    }) => {
      const { data, error } = await supabase
        .from('workout_exercises')

        .insert({
          workout_id: wId,
          exercise_id: exerciseId,
          order_index: orderIndex,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...workoutsQueryKey(), 'detail', variables.workoutId],
      });
      queryClient.invalidateQueries({ queryKey: workoutsQueryKey() });
    },
  });
}
