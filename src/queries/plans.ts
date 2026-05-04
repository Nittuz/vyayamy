import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Template, TrainingPlan, TrainingPlanSlot } from '@/db/types';
import { uuidv4 } from '@/db/uuid';
import { triggerPush } from '@/sync/engine';

import { queryKeys } from './keys';

export type ActivePlan = {
  plan: TrainingPlan;
  slots: TrainingPlanSlot[];
  templates: Map<string, Template>;
} | null;

export async function getActivePlan(userId: string): Promise<ActivePlan> {
  const db = await getDb();
  const plan = await db.getFirstAsync<TrainingPlan>(
    `SELECT * FROM training_plans
       WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  if (!plan) return null;

  const slots = await db.getAllAsync<TrainingPlanSlot>(
    `SELECT * FROM training_plan_slots
       WHERE plan_id = ? AND deleted_at IS NULL
       ORDER BY COALESCE(day_of_week, cycle_position) ASC`,
    [plan.id],
  );
  const tplIds = Array.from(new Set(slots.map((s) => s.template_id).filter(Boolean) as string[]));
  const templates = new Map<string, Template>();
  for (const id of tplIds) {
    const tpl = await db.getFirstAsync<Template>(
      'SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (tpl) templates.set(id, tpl);
  }
  return { plan, slots, templates };
}

export function useActivePlan(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.plans.active(userId) : ['plans', 'active', 'none'],
    queryFn: () => (userId ? getActivePlan(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

export async function listTemplates(userId: string): Promise<Template[]> {
  const db = await getDb();
  return db.getAllAsync<Template>(
    'SELECT * FROM templates WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC',
    [userId],
  );
}

export function useTemplates(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.templates(userId) : ['templates', 'none'],
    queryFn: () => (userId ? listTemplates(userId) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export interface SavePlanArgs {
  userId: string;
  planId?: string;
  name: string;
  planType: 'weekly' | 'cycle';
  slots: Array<{
    templateId: string | null;
    dayOfWeek?: number;
    cyclePosition?: number;
    isRestDay: boolean;
    label: string | null;
  }>;
}

export async function saveActivePlan(args: SavePlanArgs): Promise<string> {
  const db = await getDb();
  const planId = args.planId ?? uuidv4();

  if (!args.planId) {
    const existing = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM training_plans WHERE user_id = ? AND is_active = 1',
      [args.userId],
    );
    for (const e of existing) {
      await enqueueMutation({
        table: 'training_plans',
        op: 'update',
        rowId: e.id,
        payload: { is_active: false },
      });
    }
  }

  await enqueueMutation({
    table: 'training_plans',
    op: 'upsert',
    rowId: planId,
    payload: {
      user_id: args.userId,
      name: args.name,
      plan_type: args.planType,
      is_active: true,
      cycle_cursor: 0,
    },
  });

  const oldSlots = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM training_plan_slots WHERE plan_id = ? AND deleted_at IS NULL',
    [planId],
  );
  for (const s of oldSlots) {
    await enqueueMutation({ table: 'training_plan_slots', op: 'delete', rowId: s.id });
  }

  for (const slot of args.slots) {
    await enqueueMutation({
      table: 'training_plan_slots',
      op: 'insert',
      rowId: uuidv4(),
      payload: {
        plan_id: planId,
        template_id: slot.templateId,
        day_of_week: slot.dayOfWeek ?? null,
        cycle_position: slot.cyclePosition ?? null,
        is_rest_day: slot.isRestDay,
        label: slot.label,
      },
    });
  }

  void triggerPush();
  return planId;
}

export function useSaveActivePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveActivePlan,
    onSuccess: (_id, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.plans.active(vars.userId) }),
  });
}
