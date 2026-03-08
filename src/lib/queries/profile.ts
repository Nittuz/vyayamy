import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Database, Profile } from '../../types/database';

const PROFILE_KEY = ['profile'] as const;
const PROFILE_STATS_KEY = ['profile', 'stats'] as const;

export type ProfileStats = {
  workouts: number;
  exercises: number;
  prs: number;
};

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: [...PROFILE_KEY, userId ?? ''],
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as Profile;
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<Profile, Error, ProfileUpdate>({
    mutationFn: async (updates: ProfileUpdate) => {
      if (!userId) throw new Error('Not authenticated');
      const from = supabase.from('profiles');
      const { data, error } = await from.update(updates).eq('id', userId).select().single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (data) => {
      if (userId) queryClient.setQueryData([...PROFILE_KEY, userId], data);
    },
  });
}

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: [...PROFILE_STATS_KEY, userId ?? ''],
    queryFn: async (): Promise<ProfileStats> => {
      if (!userId) return { workouts: 0, exercises: 0, prs: 0 };

      const [workoutsRes, exercisesRes, prsRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('ended_at', 'is', null),
        supabase
          .from('workout_exercises')
          .select('*, workouts!inner(user_id)', { count: 'exact', head: true })
          .eq('workouts.user_id', userId),
        supabase
          .from('personal_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

      if (workoutsRes.error) throw workoutsRes.error;
      if (exercisesRes.error) throw exercisesRes.error;
      if (prsRes.error) throw prsRes.error;

      return {
        workouts: workoutsRes.count ?? 0,
        exercises: exercisesRes.count ?? 0,
        prs: prsRes.count ?? 0,
      };
    },
    enabled: !!userId,
  });
}
