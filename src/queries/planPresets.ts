/**
 * Plan preset catalog reads.
 *
 * Presets are public-read content seeded server-side (migrations 00006/00008)
 * and pulled into local SQLite by the existing sync engine. The wizard uses
 * these to offer "Start from a preset" before any plan exists.
 *
 * Apply (clone into user tables) lives in src/queries/plans.ts —
 * this module is read-only.
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type {
  PlanPreset,
  PlanPresetExercise,
  PlanPresetSlot,
  PlanPresetTemplate,
} from '@/db/types';

import { queryKeys } from './keys';

export interface HydratedPresetTemplate {
  template: PlanPresetTemplate;
  exercises: PlanPresetExercise[];
}

export interface HydratedPreset {
  preset: PlanPreset;
  templates: HydratedPresetTemplate[];
  slots: PlanPresetSlot[];
}

export async function listPlanPresets(): Promise<HydratedPreset[]> {
  const db = await getDb();

  const presets = await db.getAllAsync<PlanPreset>(
    `SELECT * FROM plan_presets
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`,
  );
  if (presets.length === 0) return [];

  const out: HydratedPreset[] = [];
  for (const preset of presets) {
    const templates = await db.getAllAsync<PlanPresetTemplate>(
      `SELECT * FROM plan_preset_templates
         WHERE preset_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC`,
      [preset.id],
    );
    const hydratedTemplates: HydratedPresetTemplate[] = [];
    for (const tpl of templates) {
      const exercises = await db.getAllAsync<PlanPresetExercise>(
        `SELECT * FROM plan_preset_exercises
           WHERE preset_template_id = ? AND deleted_at IS NULL
           ORDER BY order_index ASC`,
        [tpl.id],
      );
      hydratedTemplates.push({ template: tpl, exercises });
    }
    const slots = await db.getAllAsync<PlanPresetSlot>(
      `SELECT * FROM plan_preset_slots
         WHERE preset_id = ? AND deleted_at IS NULL
         ORDER BY COALESCE(day_of_week, cycle_position) ASC`,
      [preset.id],
    );
    out.push({ preset, templates: hydratedTemplates, slots });
  }
  return out;
}

export function useListPlanPresets() {
  return useQuery({
    queryKey: queryKeys.planPresets.list(),
    queryFn: listPlanPresets,
  });
}
