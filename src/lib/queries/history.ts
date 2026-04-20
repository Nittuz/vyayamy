import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Workout } from '../../types/database';

const HISTORY_KEY = ['history'] as const;

type HistoryFilters = {
  period?: 'all' | 'month' | '3months' | 'year';
  templateId?: string | null;
  exerciseId?: string | null;
};

export type HistoryWorkout = Workout & {
  exerciseCount: number;
  muscleGroups: string[];
};

function periodToRange(period: 'month' | '3months' | 'year'): { from: string } {
  const now = new Date();
  let from: Date;
  if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === '3months') {
    from = new Date(now);
    from.setMonth(from.getMonth() - 3);
  } else {
    from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
  return { from: from.toISOString() };
}

type NestedRow = Workout & {
  workout_exercises: { exercises: { muscle_group: string | null } | null }[];
};

export function useHistoryWorkouts(userId: string | undefined, filters: HistoryFilters = {}) {
  return useQuery({
    queryKey: [...HISTORY_KEY, userId ?? '', filters.period ?? 'all', filters.templateId ?? '', filters.exerciseId ?? ''],
    queryFn: async (): Promise<HistoryWorkout[]> => {
      if (!userId) return [];
      let workoutIds: string[] | null = null;
      if (filters.exerciseId) {
        const { data: weRows } = await supabase
          .from('workout_exercises')
          .select('workout_id')
          .eq('exercise_id', filters.exerciseId!);
        workoutIds = (weRows ?? []).map((r: { workout_id: string }) => r.workout_id);
        if (workoutIds.length === 0) return [];
      }
      let builder = supabase
        .from('workouts')
        .select('*, workout_exercises(exercises(muscle_group))')
        .eq('user_id', userId)
        .not('ended_at', 'is', null);
      if (filters.period && filters.period !== 'all') {
        const { from } = periodToRange(filters.period);
        builder = builder.gte('started_at', from);
      }
      if (filters.templateId) builder = builder.eq('template_id', filters.templateId);
      if (workoutIds) builder = builder.in('id', workoutIds);
      const { data, error } = await builder
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      return ((data ?? []) as NestedRow[]).map((row) => {
        const wes = row.workout_exercises ?? [];
        const groups = new Set<string>();
        for (const we of wes) {
          if (we.exercises?.muscle_group) groups.add(we.exercises.muscle_group);
        }
        return {
          id: row.id,
          user_id: row.user_id,
          started_at: row.started_at,
          ended_at: row.ended_at,
          title: row.title,
          template_id: row.template_id,
          created_at: row.created_at,
          exerciseCount: wes.length,
          muscleGroups: Array.from(groups),
        };
      });
    },
    enabled: !!userId,
  });
}
