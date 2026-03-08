import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { PersonalRecord } from '../../types/database';

const RECORDS_KEY = ['records'] as const;

export function usePersonalRecords(userId: string | undefined) {
  return useQuery({
    queryKey: [...RECORDS_KEY, userId ?? ''],
    queryFn: async (): Promise<PersonalRecord[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', userId)
        .order('achieved_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PersonalRecord[];
    },
    enabled: !!userId,
  });
}

export type ExerciseHistoryPoint = {
  date: string;
  weight: number | null;
  reps: number | null;
  volume: number;
  estimated1Rm: number | null;
};

export function useExerciseHistory(userId: string | undefined, exerciseId: string | undefined) {
  return useQuery({
    queryKey: ['exerciseHistory', userId ?? '', exerciseId ?? ''],
    queryFn: async (): Promise<ExerciseHistoryPoint[]> => {
      if (!userId || !exerciseId) return [];
      const { data: weRows, error: weError } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, workouts(started_at, ended_at)')
        .eq('exercise_id', exerciseId);
      if (weError) throw weError;
      const weList = (weRows ?? []) as { id: string; workouts: { started_at: string; ended_at: string | null } | null }[];
      const weIds = weList.map((we) => we.id);
      if (weIds.length === 0) return [];
      const { data: setsRows, error: setsError } = await supabase
        .from('sets')
        .select('workout_exercise_id, weight, reps, completed_at')
        .in('workout_exercise_id', weIds)
        .eq('completed', true);
      if (setsError) throw setsError;
      const byWe = new Map<string, { started_at: string }>();
      for (const we of weList) {
        if (we.workouts?.started_at) byWe.set(we.id, { started_at: we.workouts.started_at });
      }
      const points: ExerciseHistoryPoint[] = [];
      for (const s of (setsRows ?? []) as { workout_exercise_id: string; weight: number | null; reps: number | null }[]) {
        const we = byWe.get(s.workout_exercise_id);
        if (!we) continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        const volume = weight * reps;
        let estimated1Rm: number | null = null;
        if (weight > 0 && reps > 0 && reps <= 12) {
          estimated1Rm = Math.round(weight * (1 + reps / 30));
        }
        points.push({
          date: we.started_at,
          weight: s.weight,
          reps: s.reps,
          volume,
          estimated1Rm,
        });
      }
      points.sort((a, b) => a.date.localeCompare(b.date));
      return points;
    },
    enabled: !!userId && !!exerciseId,
  });
}

export function useWeeklyFrequency(userId: string | undefined, weeks = 6) {
  return useQuery({
    queryKey: ['weeklyFrequency', userId ?? '', weeks],
    queryFn: async (): Promise<{ weekStart: string; count: number }[]> => {
      if (!userId) return [];
      const from = new Date();
      from.setDate(from.getDate() - weeks * 7);
      const { data, error } = await supabase
        .from('workouts')
        .select('started_at')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .gte('started_at', from.toISOString());
      if (error) throw error;
      const byWeek = new Map<string, number>();
      for (const w of (data ?? []) as { started_at: string }[]) {
        const d = new Date(w.started_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const key = weekStart.toISOString().slice(0, 10);
        byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
      }
      const result: { weekStart: string; count: number }[] = [];
      for (let i = 0; i < weeks; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() - (weeks - 1 - i) * 7);
        weekStart.setHours(0, 0, 0, 0);
        const key = weekStart.toISOString().slice(0, 10);
        result.push({ weekStart: key, count: byWeek.get(key) ?? 0 });
      }
      return result;
    },
    enabled: !!userId,
  });
}
