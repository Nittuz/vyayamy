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
    staleTime: 2 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
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
      let sourceWorkoutId: string | null = input.copyFromWorkoutId ?? null;

      if (input.copyFromWorkoutId) {
        const { data: rows, error } = await supabase
          .from('workout_exercises')
          .select('exercise_id')
          .eq('workout_id', input.copyFromWorkoutId)
          .order('order_index');
        if (!error && rows?.length) {
          exerciseIds = rows.map((r: { exercise_id: string }) => r.exercise_id);
        }
      } else if (input.templateId) {
        const { data: lastW } = await supabase
          .from('workouts')
          .select('id')
          .eq('user_id', userId)
          .eq('template_id', input.templateId)
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastW) sourceWorkoutId = (lastW as { id: string }).id;
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
        const { data: weData, error: weError } = await supabase
          .from('workout_exercises')
          .insert(workoutExercises)
          .select('id, exercise_id, order_index');
        if (weError) throw weError;

        type WeRow = { id: string; exercise_id: string; order_index: number };
        const createdWes = (weData ?? []) as WeRow[];

        type SourceSet = { weight: number | null; reps: number | null; order_index: number; completed: boolean };
        type SourceWe = { exercise_id: string; sets: SourceSet[] };
        const sourceSetsMap = new Map<string, SourceSet[]>();

        if (sourceWorkoutId) {
          const { data: sourceWes } = await supabase
            .from('workout_exercises')
            .select('exercise_id, sets(weight, reps, order_index, completed)')
            .eq('workout_id', sourceWorkoutId)
            .order('order_index');
          if (sourceWes) {
            for (const we of sourceWes as SourceWe[]) {
              const completed = we.sets
                .filter((s) => s.completed)
                .sort((a, b) => a.order_index - b.order_index);
              if (completed.length > 0) {
                sourceSetsMap.set(we.exercise_id, completed);
              }
            }
          }
        }

        const setRows: {
          workout_exercise_id: string;
          order_index: number;
          weight: number | null;
          reps: number | null;
          completed: boolean;
        }[] = [];

        for (const we of createdWes) {
          const prev = sourceSetsMap.get(we.exercise_id);
          if (prev && prev.length > 0) {
            for (let i = 0; i < prev.length; i++) {
              setRows.push({
                workout_exercise_id: we.id,
                order_index: i,
                weight: prev[i].weight,
                reps: prev[i].reps,
                completed: false,
              });
            }
          } else {
            for (let i = 0; i < 3; i++) {
              setRows.push({
                workout_exercise_id: we.id,
                order_index: i,
                weight: null,
                reps: null,
                completed: false,
              });
            }
          }
        }

        if (setRows.length > 0) {
          const { error: setError } = await supabase.from('sets').insert(setRows);
          if (setError) throw setError;
        }
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
      if (error) throw error;
      if (!data) return null;

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

export type LastPerformedSets = Record<string, { weight: number | null; reps: number | null }[]>;

export function useLastPerformedSets(userId: string | undefined, exerciseIds: string[]) {
  const stableKey = exerciseIds.slice().sort().join(',');
  return useQuery({
    queryKey: [...WORKOUTS_KEY, 'lastPerformed', userId ?? '', stableKey],
    queryFn: async (): Promise<LastPerformedSets> => {
      if (!userId || exerciseIds.length === 0) return {};

      const { data: recentWorkouts, error: wErr } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(10);
      if (wErr) throw wErr;
      if (!recentWorkouts?.length) return {};

      const workoutIds = (recentWorkouts as { id: string }[]).map((w) => w.id);

      const { data: weRows, error: weErr } = await supabase
        .from('workout_exercises')
        .select('id, exercise_id, workout_id')
        .in('workout_id', workoutIds)
        .in('exercise_id', exerciseIds);
      if (weErr) throw weErr;
      if (!weRows?.length) return {};

      type WeRow = { id: string; exercise_id: string; workout_id: string };
      const workoutOrder = new Map(workoutIds.map((id, i) => [id, i]));
      const latestWeByExercise = new Map<string, { weId: string; rank: number }>();
      for (const row of weRows as WeRow[]) {
        const rank = workoutOrder.get(row.workout_id) ?? Infinity;
        const existing = latestWeByExercise.get(row.exercise_id);
        if (!existing || rank < existing.rank) {
          latestWeByExercise.set(row.exercise_id, { weId: row.id, rank });
        }
      }

      const weIds = Array.from(latestWeByExercise.values()).map((v) => v.weId);
      if (weIds.length === 0) return {};

      const { data: setsRows, error: sErr } = await supabase
        .from('sets')
        .select('workout_exercise_id, weight, reps, order_index')
        .in('workout_exercise_id', weIds)
        .eq('completed', true)
        .order('order_index');
      if (sErr) throw sErr;

      const weIdToExerciseId = new Map<string, string>();
      for (const [exId, { weId }] of latestWeByExercise) {
        weIdToExerciseId.set(weId, exId);
      }

      const result: LastPerformedSets = {};
      type SetRow = { workout_exercise_id: string; weight: number | null; reps: number | null };
      for (const s of (setsRows ?? []) as SetRow[]) {
        const exId = weIdToExerciseId.get(s.workout_exercise_id);
        if (!exId) continue;
        if (!result[exId]) result[exId] = [];
        result[exId].push({ weight: s.weight, reps: s.reps });
      }
      return result;
    },
    enabled: !!userId && exerciseIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteAllWorkouts(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKOUTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['records'] });
    },
  });
}
