/**
 * Day-of-week name for a date input.
 * Used as the default workout title (e.g. "Tuesday") when the user
 * doesn't supply one.
 */
import { DAY_NAMES } from '@/core/format';

export function dayOfWeek(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return DAY_NAMES[d.getDay()]!;
}
