/**
 * Compose a workout title from a list of exercise muscle groups.
 *
 * Phase 4: triggered on the 3rd-exercise add to a workout whose title
 * is still the day-of-week default. Dedupes case-insensitively but
 * preserves the first-seen casing.
 */
export function compositionTitle(exerciseMuscleGroups: (string | null | undefined)[]): string {
  const seenLower = new Set<string>();
  const result: string[] = [];
  for (const raw of exerciseMuscleGroups) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const lower = trimmed.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    result.push(trimmed);
  }
  return result.join(' + ');
}
