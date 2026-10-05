/**
 * The title a workout shows in a list. A workout the user never named is
 * listed by the day it started ("Sunday"), the same fallback the active
 * screen's header uses, instead of the stored default "Workout" (HIG review
 * 2026-10-04, finding 14: weekday titles and "Workout" rows mixed in one list).
 */
import { DAY_NAMES } from './format';

/** The stored default a new workout is created with. */
export const UNTITLED_WORKOUT = 'Workout';

export function workoutDisplayTitle(
  title: string | null | undefined,
  startedAt: string | null | undefined,
): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (trimmed !== '' && trimmed !== UNTITLED_WORKOUT) return trimmed;
  if (startedAt) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) return DAY_NAMES[d.getDay()]!;
  }
  return UNTITLED_WORKOUT;
}
