import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Template } from '../../types/database';

const TEMPLATES_KEY = ['templates'] as const;

export function useTemplates(userId: string | undefined) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, userId ?? ''],
    queryFn: async (): Promise<Template[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
    enabled: !!userId,
  });
}

export function useCreateTemplate(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; exercise_order?: string[] }): Promise<Template> => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('templates')

        .insert({
          user_id: userId,
          name: input.name,
          exercise_order: input.exercise_order ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useUpdateTemplate(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      exercise_order,
    }: {
      id: string;
      name?: string;
      exercise_order?: string[];
    }): Promise<Template> => {
      if (!userId) throw new Error('Not authenticated');
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (exercise_order !== undefined) updates.exercise_order = exercise_order;
      const { data, error } = await supabase
        .from('templates')

        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useDeleteTemplate(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}
