import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { TrainingPlan, TrainingPlanSlot, Workout } from '../../types/database';

const PLANS_KEY = ['training_plans'] as const;

export function plansQueryKey() {
  return [...PLANS_KEY] as const;
}

export type PlanWithSlots = TrainingPlan & { slots: TrainingPlanSlot[] };

export function useActivePlan(userId: string | undefined) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'active', userId ?? ''],
    queryFn: async (): Promise<PlanWithSlots | null> => {
      if (!userId) return null;
      const { data: plan, error: planError } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planError) throw planError;
      if (!plan) return null;

      const { data: slots, error: slotsError } = await supabase
        .from('training_plan_slots')
        .select('*')
        .eq('plan_id', plan.id)
        .order('day_of_week', { ascending: true })
        .order('cycle_position', { ascending: true });
      if (slotsError) throw slotsError;

      return { ...(plan as TrainingPlan), slots: (slots ?? []) as TrainingPlanSlot[] };
    },
    enabled: !!userId,
  });
}

export function useWeekCompletions(userId: string | undefined) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'week-completions', userId ?? ''],
    queryFn: async (): Promise<Workout[]> => {
      if (!userId) return [];
      const now = new Date();
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dow + 6) % 7));
      monday.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .gte('started_at', monday.toISOString())
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Workout[];
    },
    enabled: !!userId,
  });
}

type SlotInput = {
  template_id?: string | null;
  day_of_week?: number | null;
  cycle_position?: number | null;
  is_rest_day?: boolean;
  label?: string | null;
};

type CreatePlanInput = {
  name: string;
  plan_type: 'weekly' | 'cycle';
  slots: SlotInput[];
};

export function useCreatePlan(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePlanInput): Promise<TrainingPlan> => {
      if (!userId) throw new Error('Not authenticated');

      const { error: deactivateError } = await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);
      if (deactivateError) throw deactivateError;

      const { data: plan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: userId,
          name: input.name,
          plan_type: input.plan_type,
          is_active: true,
          cycle_cursor: 0,
        })
        .select()
        .single();
      if (planError) throw planError;

      if (input.slots.length > 0) {
        const slotRows = input.slots.map((s) => ({
          plan_id: (plan as TrainingPlan).id,
          template_id: s.template_id ?? null,
          day_of_week: s.day_of_week ?? null,
          cycle_position: s.cycle_position ?? null,
          is_rest_day: s.is_rest_day ?? false,
          label: s.label ?? null,
        }));
        const { error: slotsError } = await supabase
          .from('training_plan_slots')
          .insert(slotRows);
        if (slotsError) throw slotsError;
      }

      return plan as TrainingPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
    },
  });
}

type UpdatePlanInput = {
  id: string;
  name?: string;
  slots?: SlotInput[];
};

export function useUpdatePlan(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePlanInput): Promise<TrainingPlan> => {
      if (!userId) throw new Error('Not authenticated');

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('training_plans')
          .update(updates)
          .eq('id', input.id)
          .eq('user_id', userId);
        if (error) throw error;
      }

      if (input.slots !== undefined) {
        const { error: deleteError } = await supabase
          .from('training_plan_slots')
          .delete()
          .eq('plan_id', input.id);
        if (deleteError) throw deleteError;

        if (input.slots.length > 0) {
          const slotRows = input.slots.map((s) => ({
            plan_id: input.id,
            template_id: s.template_id ?? null,
            day_of_week: s.day_of_week ?? null,
            cycle_position: s.cycle_position ?? null,
            is_rest_day: s.is_rest_day ?? false,
            label: s.label ?? null,
          }));
          const { error: insertError } = await supabase
            .from('training_plan_slots')
            .insert(slotRows);
          if (insertError) throw insertError;
        }
      }

      const { data, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('id', input.id)
        .single();
      if (error) throw error;
      return data as TrainingPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
    },
  });
}

export function useDeletePlan(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', planId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
    },
  });
}

export function useAdvanceCycle(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, totalSlots }: { planId: string; totalSlots: number }): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');

      const { data: plan, error: fetchError } = await supabase
        .from('training_plans')
        .select('cycle_cursor')
        .eq('id', planId)
        .single();
      if (fetchError) throw fetchError;

      const nextCursor = ((plan as { cycle_cursor: number }).cycle_cursor + 1) % totalSlots;

      const { error } = await supabase
        .from('training_plans')
        .update({ cycle_cursor: nextCursor })
        .eq('id', planId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
    },
  });
}

// Pure utility: determine today's slot from a plan
export function getTodaySlot(plan: PlanWithSlots): TrainingPlanSlot | null {
  if (plan.plan_type === 'weekly') {
    const jsDay = new Date().getDay(); // 0=Sun
    const dayOfWeek = (jsDay + 6) % 7; // convert to 0=Mon
    return plan.slots.find((s) => s.day_of_week === dayOfWeek) ?? null;
  }
  return plan.slots.find((s) => s.cycle_position === plan.cycle_cursor) ?? null;
}

// Get upcoming slots after today (for the "upcoming" list)
export function getUpcomingSlots(plan: PlanWithSlots, count: number): TrainingPlanSlot[] {
  if (plan.slots.length === 0) return [];

  if (plan.plan_type === 'weekly') {
    const jsDay = new Date().getDay();
    const todayDow = (jsDay + 6) % 7;
    const result: TrainingPlanSlot[] = [];
    for (let offset = 1; offset <= 7 && result.length < count; offset++) {
      const dow = (todayDow + offset) % 7;
      const slot = plan.slots.find((s) => s.day_of_week === dow);
      if (slot && !slot.is_rest_day) result.push(slot);
    }
    return result;
  }

  // Cycle: next N non-rest slots after cursor
  const total = plan.slots.length;
  const result: TrainingPlanSlot[] = [];
  for (let offset = 1; offset <= total && result.length < count; offset++) {
    const pos = (plan.cycle_cursor + offset) % total;
    const slot = plan.slots.find((s) => s.cycle_position === pos);
    if (slot && !slot.is_rest_day) result.push(slot);
  }
  return result;
}

// Check if a slot was completed on a given date
export function isSlotCompletedOnDate(
  slot: TrainingPlanSlot,
  workouts: Workout[],
  date: Date,
): boolean {
  if (slot.is_rest_day) return false;
  if (!slot.template_id) return false;
  const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return workouts.some((w) => {
    if (w.template_id !== slot.template_id) return false;
    if (!w.ended_at) return false;
    const d = new Date(w.started_at);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === dateStr;
  });
}

// TODO Phase 3: compute streak length and surface in plan overview

export type MissedSlotInfo = {
  slot: TrainingPlanSlot;
  date: Date;
  dayOfWeek: number;
};

export function getMissedWeeklySlots(
  plan: PlanWithSlots,
  weekWorkouts: Workout[],
): MissedSlotInfo[] {
  if (plan.plan_type !== 'weekly') return [];
  const now = new Date();
  const todayDow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((todayDow + 6) % 7 + 1 - 1));
  monday.setDate(now.getDate() - todayDow);
  monday.setHours(0, 0, 0, 0);

  const missed: MissedSlotInfo[] = [];
  for (let dow = 0; dow < todayDow; dow++) {
    const slot = plan.slots.find((s) => s.day_of_week === dow);
    if (!slot || slot.is_rest_day || !slot.template_id) continue;
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + dow);
    if (!isSlotCompletedOnDate(slot, weekWorkouts, dayDate)) {
      missed.push({ slot, date: dayDate, dayOfWeek: dow });
    }
  }
  return missed;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayOfWeekName(dow: number, short = false): string {
  return short ? (DAY_NAMES_SHORT[dow] ?? '') : (DAY_NAMES[dow] ?? '');
}
