/**
 * Day-of-week name for a date input.
 * Used as the default workout title (e.g. "Tuesday") when the user
 * doesn't supply one.
 */
const NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function dayOfWeek(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  const index = d.getDay();
  return NAMES[index]!;
}
