/**
 * A stable fingerprint of a plan draft, so the editor knows whether leaving
 * would lose work (HIG review 2026-10-04, finding 9: back discarded every
 * edit silently, and Save sat below seven day cards).
 */
import type { SlotDraft } from './domain';

export interface PlanDraft {
  name: string;
  planType: 'weekly' | 'cycle';
  slots: readonly SlotDraft[];
}

export function planDraftKey(draft: PlanDraft): string {
  return JSON.stringify({
    name: draft.name,
    planType: draft.planType,
    slots: draft.slots.map((s) => ({
      templateId: s.isRestDay ? null : s.templateId,
      isRestDay: s.isRestDay,
      label: s.label || null,
      dayOfWeek: s.dayOfWeek ?? null,
      cyclePosition: s.cyclePosition ?? null,
    })),
  });
}

export function isPlanDraftDirty(baseline: string | null, draft: PlanDraft): boolean {
  return baseline != null && planDraftKey(draft) !== baseline;
}
