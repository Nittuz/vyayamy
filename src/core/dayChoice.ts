/**
 * Pure day-choice helpers for PlanSetup's per-day control (impeccable polish
 * A). Each day in a plan draft picks exactly one of: Rest, No template, or a
 * specific template — three mutually exclusive values that used to live
 * across two separate controls (a Rest-day toggle chip anchored top-right,
 * plus a None/template pill row below it on non-rest days). Recomposed into
 * a single Segment; these functions are the pure translation between that
 * Segment's flat string value and the slot draft's real fields (isRestDay +
 * templateId), so the write semantics survive the recomposition unchanged —
 * rest, none, and a template id remain three distinct values in the slot
 * model (planResolver's rest/unconfigured split depends on the distinction
 * between "no template because resting" and "no template while training").
 */
import type { SlotDraft } from './domain';

/** The Segment's flat value: 'rest' | 'none' | a template id. */
export type DayChoiceValue = string;

export const DAY_CHOICE_REST = 'rest';
export const DAY_CHOICE_NONE = 'none';

export interface DayChoiceOption {
  value: DayChoiceValue;
  label: string;
  accessibilityLabel: string;
}

/**
 * Builds one day's Segment options: Rest, then None, then every template
 * available to pick from (labels unchanged from the old pill row). Each
 * option's accessibility label carries the day so VoiceOver announces
 * "Monday schedule, Push day" rather than a bare "Push day" repeated across
 * seven identical-looking rows.
 */
export function buildDayChoiceOptions(
  dayLabel: string,
  templates: readonly { id: string; name: string }[],
): DayChoiceOption[] {
  return [
    { value: DAY_CHOICE_REST, label: 'Rest', accessibilityLabel: `${dayLabel} schedule, rest` },
    {
      value: DAY_CHOICE_NONE,
      label: 'None',
      accessibilityLabel: `${dayLabel} schedule, no template`,
    },
    ...templates.map((t) => ({
      value: t.id,
      label: t.name,
      accessibilityLabel: `${dayLabel} schedule, ${t.name}`,
    })),
  ];
}

/** Which Segment value a slot's current isRestDay/templateId represents. */
export function dayChoiceValue(slot: Pick<SlotDraft, 'isRestDay' | 'templateId'>): DayChoiceValue {
  if (slot.isRestDay) return DAY_CHOICE_REST;
  return slot.templateId ?? DAY_CHOICE_NONE;
}

/**
 * The slot patch for picking a Segment value.
 *
 * Rest only flips `isRestDay` — `templateId` is left untouched, matching the
 * old Rest-day toggle's write (`setSlotAt(idx, { isRestDay: true })`), so a
 * previously-picked template quietly reappears if the day is un-rested
 * later instead of being lost the moment Rest is tapped.
 *
 * None and a template id both also clear `isRestDay`: unlike the old pills
 * (only rendered once a day was already non-rest, so they never needed to
 * touch the flag), a single control can now jump straight from Rest to a
 * template in one press and must carry both fields itself.
 */
export function dayChoicePatch(value: DayChoiceValue): Partial<SlotDraft> {
  if (value === DAY_CHOICE_REST) return { isRestDay: true };
  if (value === DAY_CHOICE_NONE) return { isRestDay: false, templateId: null };
  return { isRestDay: false, templateId: value };
}
