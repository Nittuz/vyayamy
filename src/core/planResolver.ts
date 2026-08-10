/**
 * Plan resolver — pure functions only (spec 2026-08-10-plan-reaches-today).
 *
 * Answers "what does the active plan schedule for today?" so Today can render
 * a scheduled card instead of leaving plans decorative (backlog §5.1).
 *
 * Day semantics: todayDow is the DEVICE-LOCAL weekday with Sunday = 0 — the
 * same convention as src/lib/dayOfWeek.ts and Date.getDay(), so the card
 * always agrees with the greeting and the default workout title. Cycle plans
 * ignore the calendar entirely: the slot at cycle_cursor (modulo the ordered
 * slot count) is "today", and the cursor only moves when a scheduled workout
 * finishes (or a rest is skipped).
 */
import type { TrainingPlan, TrainingPlanSlot } from '@/db/types';

export type TodaySlotResolution =
  | { kind: 'workout'; slot: TrainingPlanSlot; templateId: string }
  | { kind: 'rest'; slot: TrainingPlanSlot }
  /** A non-rest slot with no template: distinct from 'none' because a CYCLE
   *  cursor parked on it needs a skip affordance or the cycle stalls forever
   *  (review finding); weekly callers may treat it as none — the calendar
   *  advances past it on its own. */
  | { kind: 'unconfigured'; slot: TrainingPlanSlot }
  | { kind: 'none' };

/** SQLite has no boolean type — is_rest_day arrives as 0/1. */
function isRest(slot: TrainingPlanSlot): boolean {
  return Boolean(slot.is_rest_day);
}

function resolveSlot(slot: TrainingPlanSlot | undefined): TodaySlotResolution {
  if (!slot) return { kind: 'none' };
  if (isRest(slot)) return { kind: 'rest', slot };
  if (!slot.template_id) return { kind: 'unconfigured', slot };
  return { kind: 'workout', slot, templateId: slot.template_id };
}

export function resolveTodaySlot(
  plan: Pick<TrainingPlan, 'plan_type' | 'cycle_cursor'>,
  slots: TrainingPlanSlot[],
  todayDow: number,
): TodaySlotResolution {
  if (plan.plan_type === 'weekly') {
    return resolveSlot(slots.find((s) => s.day_of_week === todayDow));
  }
  const ordered = slots
    .filter((s) => s.cycle_position != null)
    .sort((a, b) => a.cycle_position! - b.cycle_position!);
  if (ordered.length === 0) return { kind: 'none' };
  const idx = ((plan.cycle_cursor % ordered.length) + ordered.length) % ordered.length;
  return resolveSlot(ordered[idx]);
}
