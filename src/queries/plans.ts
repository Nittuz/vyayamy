import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import type { Template, TrainingPlan, TrainingPlanSlot } from '@/db/types';
import { uuidv4 } from '@/db/uuid';
import type { HydratedPreset } from '@/queries/planPresets';
import { emitMutationCommitted } from '@/db/mutationEvents';

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
  // exercise_order is JSON-encoded TEXT in SQLite (mirroring Postgres's uuid[]);
  // parse on read so callers see the typed string[] their TypeScript expects.
  const rows = await db.getAllAsync<Omit<Template, 'exercise_order'> & { exercise_order: string }>(
    'SELECT * FROM templates WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC',
    [userId],
  );
  return rows.map((r) => ({ ...r, exercise_order: parseExerciseOrder(r.exercise_order) }));
}

function parseExerciseOrder(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
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
  slots: {
    templateId: string | null;
    dayOfWeek?: number;
    cyclePosition?: number;
    isRestDay: boolean;
    label: string | null;
  }[];
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

  emitMutationCommitted();
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

export interface ApplyPresetArgs {
  userId: string;
  preset: HydratedPreset;
  name: string;
  slots: {
    presetTemplateId: string | null;
    dayOfWeek?: number;
    cyclePosition?: number;
    isRestDay: boolean;
    label: string | null;
  }[];
}

/**
 * Clone a preset into user-scoped tables and save the result as the
 * active plan, all via the outbox in a single logical batch.
 *
 * Order of writes matters for FK-friendly server replay:
 *   1. exercises (resolve-or-create per unique preset exercise name)
 *   2. templates (one per preset template, referencing resolved exercise IDs)
 *   3. plan + plan slots (via saveActivePlan, referencing the new templates)
 *
 * Resolve-or-create prefers global exercises (user_id IS NULL) so picking
 * a "generic" preset like Full Body 3× reuses the seeded global catalog
 * (00007) instead of duplicating "Back Squat" into every user's account.
 * Falls back to existing user-scoped exercises by name match (so the
 * Beyond Strength preset reuses nittuz4's rows seeded in 00005), and
 * finally creates a new user-scoped exercise if nothing matches.
 */
export async function applyPresetAndSavePlan(args: ApplyPresetArgs): Promise<string> {
  const db = await getDb();

  // 1. Resolve-or-create exercises by name (case-insensitive).
  const uniqueExercises = new Map<string, { name: string; muscleGroup: string | null }>();
  for (const t of args.preset.templates) {
    for (const e of t.exercises) {
      const key = e.name.toLowerCase();
      if (!uniqueExercises.has(key)) {
        uniqueExercises.set(key, { name: e.name, muscleGroup: e.muscle_group });
      }
    }
  }
  const exerciseIdByLowerName = new Map<string, string>();
  for (const [key, info] of uniqueExercises) {
    const id = await resolveOrCreateExercise(db, args.userId, info.name, info.muscleGroup);
    exerciseIdByLowerName.set(key, id);
  }

  // 2. Create one new templates row per preset template. Always clones
  // fresh — no reuse-by-name with existing user templates (per spec).
  const newTemplateIdByPresetTemplateId = new Map<string, string>();
  for (const t of args.preset.templates) {
    const newTemplateId = uuidv4();
    const order = t.exercises
      .map((e) => exerciseIdByLowerName.get(e.name.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    await enqueueMutation({
      table: 'templates',
      op: 'insert',
      rowId: newTemplateId,
      payload: {
        user_id: args.userId,
        name: t.template.name,
        exercise_order: order,
      },
    });
    newTemplateIdByPresetTemplateId.set(t.template.id, newTemplateId);
  }

  // 3. Materialize slots with the new template IDs, then save as active.
  const materializedSlots = args.slots.map((s) => ({
    templateId: s.isRestDay
      ? null
      : s.presetTemplateId
        ? newTemplateIdByPresetTemplateId.get(s.presetTemplateId) ?? null
        : null,
    isRestDay: s.isRestDay,
    label: s.label,
    dayOfWeek: s.dayOfWeek,
    cyclePosition: s.cyclePosition,
  }));

  return saveActivePlan({
    userId: args.userId,
    name: args.name,
    planType: args.preset.preset.plan_type,
    slots: materializedSlots,
  });
}

/**
 * Find an existing exercise by name (global first, then user-scoped) or
 * create a new user-scoped row. The global catalog (00007) is created
 * under user_id IS NULL; the existing RLS policy lets every user read
 * those rows. Insert path falls back to user_id = currentUser since RLS
 * forbids authenticated clients from creating global rows.
 */
async function resolveOrCreateExercise(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  name: string,
  muscleGroup: string | null,
): Promise<string> {
  const globalMatch = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM exercises
       WHERE lower(name) = lower(?) AND user_id IS NULL AND deleted_at IS NULL
       LIMIT 1`,
    [name],
  );
  if (globalMatch) return globalMatch.id;

  const userMatch = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM exercises
       WHERE lower(name) = lower(?) AND user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    [name, userId],
  );
  if (userMatch) return userMatch.id;

  const newId = uuidv4();
  await enqueueMutation({
    table: 'exercises',
    op: 'insert',
    rowId: newId,
    payload: {
      user_id: userId,
      name,
      muscle_group: muscleGroup,
    },
  });
  return newId;
}

export function useApplyPresetAndSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyPresetAndSavePlan,
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.plans.active(vars.userId) });
      qc.invalidateQueries({ queryKey: queryKeys.templates(vars.userId) });
      qc.invalidateQueries({ queryKey: queryKeys.exercises.all });
    },
  });
}
