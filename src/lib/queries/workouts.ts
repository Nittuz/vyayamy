import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Workout, WorkoutExercise, Set } from '../../types/database';

const WORKOUTS_KEY = ['workouts'] as const;

export function useRecentWorkouts(userId: string | undefined, limit = 3) {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'recent', userId ?? '', limit],
    queryFn: async (): Promise<Workout[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Workout[];
    },
    enabled: !!userId,
  });
}

export function useActiveWorkout(userId: string | undefined) {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'active', userId ?? ''],
    queryFn: async (): Promise<Workout | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Workout | null;
    },
    enabled: !!userId,
  });
}

export function useLastWorkout(userId: string | undefined) {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'last', userId ?? ''],
    queryFn: async (): Promise<Workout | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Workout | null;
    },
    enabled: !!userId,
  });
}

export function workoutsQueryKey() {
  return [...WORKOUTS_KEY] as const;
}

type CreateWorkoutInput = {
  title: string;
  templateId?: string | null;
  exerciseIds?: string[];
  copyFromWorkoutId?: string;
};

export function useCreateWorkout(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkoutInput): Promise<Workout> => {
      if (!userId) throw new Error('Not authenticated');
      let exerciseIds = input.exerciseIds ?? [];
      if (input.copyFromWorkoutId) {
        const { data: rows, error } = await supabase
          .from('workout_exercises')
          .select('exercise_id')
          .eq('workout_id', input.copyFromWorkoutId)
          .order('order_index');
        if (!error && rows?.length) {
          exerciseIds = rows.map((r: { exercise_id: string }) => r.exercise_id);
        }
      }
      const { data: workout, error: workoutError } = await supabase
        .from('workouts')

        .insert({
          user_id: userId,
          title: input.title,
          template_id: input.templateId ?? null,
        })
        .select()
        .single();
      if (workoutError) throw workoutError;
      const workoutId = (workout as Workout).id;
      if (exerciseIds.length > 0) {
        const workoutExercises = exerciseIds.map((exercise_id, i) => ({
          workout_id: workoutId,
          exercise_id,
          order_index: i,
        }));
        const { error: weError } = await supabase
          .from('workout_exercises')
  
          .insert(workoutExercises);
        if (weError) throw weError;
      }
      return workout as Workout;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
  });
}

export type WorkoutExerciseWithMeta = WorkoutExercise & {
  exercise: { id: string; name: string; muscle_group: string | null };
  sets: Set[];
};

export function useWorkoutWithExercises(workoutId: string | undefined) {
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'detail', workoutId ?? ''],
    queryFn: async (): Promise<{
      workout: Workout;
      workoutExercises: WorkoutExerciseWithMeta[];
    } | null> => {
      if (!workoutId) return null;
      const { data, error } = await supabase
        .from('workouts')
        .select(`
          *,
          workout_exercises(
            id, workout_id, exercise_id, order_index, created_at,
            exercises(id, name, muscle_group),
            sets(*)
          )
        `)
        .eq('id', workoutId)
        .single();
      if (error || !data) return null;

      type NestedRow = WorkoutExercise & {
        exercises: { id: string; name: string; muscle_group: string | null } | null;
        sets: Set[];
      };
      const raw = data as Workout & { workout_exercises: NestedRow[] };

      const workoutExercises: WorkoutExerciseWithMeta[] = (raw.workout_exercises ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((we) => ({
          ...we,
          exercise: we.exercises ?? { id: '', name: '', muscle_group: null },
          sets: (we.sets ?? []).sort((a, b) => a.order_index - b.order_index),
        }));

      const workout: Workout = {
        id: raw.id,
        user_id: raw.user_id,
        started_at: raw.started_at,
        ended_at: raw.ended_at,
        title: raw.title,
        template_id: raw.template_id,
        created_at: raw.created_at,
      };
      return { workout, workoutExercises };
    },
    enabled: !!workoutId,
  });
}
