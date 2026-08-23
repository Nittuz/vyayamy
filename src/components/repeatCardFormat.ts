/**
 * Pure formatting helpers for RepeatCard — separated from the JSX wrapper
 * so they can be unit-tested in Jest, which mocks 'react-native' down to
 * {Platform} and cannot load react-native-svg (pulled in transitively via
 * @/ui/icons) in this project's setup. Same precedent as activeSet.ts /
 * numericStepper.ts.
 */
import { formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import type { ExerciseSeed } from '@/queries/repeatLastWorkout';

export function stripText(daysAgo: number, exerciseCount: number): string {
  // Sentence case — the strip variant handles the uppercasing.
  const ago = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  const ex = exerciseCount === 1 ? '1 exercise' : `${exerciseCount} exercises`;
  return `${ago} · ${ex}`;
}

export function formatSeed(seed: ExerciseSeed): string {
  const { seedWeight, seedReps, seedUnits } = seed;
  if (seedWeight == null) {
    return seedReps == null ? '- × -' : `BW × ${seedReps}`;
  }
  const weightStr = formatWeight(seedWeight, seedUnits ?? DEFAULT_UNITS);
  return `${weightStr} × ${seedReps ?? '-'}`;
}
