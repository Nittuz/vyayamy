/**
 * Pure formatting helpers for RepeatCard — separated from the JSX wrapper
 * so they can be unit-tested in Jest, which mocks 'react-native' down to
 * {Platform} and cannot load react-native-svg (pulled in transitively via
 * @/ui/icons) in this project's setup. Same precedent as activeSet.ts /
 * numericStepper.ts.
 */
import { convertAndRoundWeight } from '@/components/activeSet';
import { formatWeight, pluralize } from '@/core/format';
import type { ExerciseSeed } from '@/queries/repeatLastWorkout';

export function stripText(daysAgo: number, exerciseCount: number): string {
  // Sentence case — the strip variant handles the uppercasing.
  const ago = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  return `${ago} · ${pluralize(exerciseCount, 'exercise')}`;
}

/**
 * `displayUnits`/`weightStep` are the CURRENT profile's — the preview must
 * show the same converted+rounded number Start will actually seed (task-1
 * §(d)): repeatLastWorkout/startPlannedWorkout convert each seed's raw
 * historical weight into the profile unit at creation time, so a preview
 * that kept showing the raw historical unit would quietly disagree with the
 * workout it's a preview of. Reuses the exact convert+round helper those
 * creation paths (and planFirstSet) use — never reimplemented here.
 */
export function formatSeed(
  seed: ExerciseSeed,
  displayUnits: 'kg' | 'lb',
  weightStep: number,
): string {
  const { seedWeight, seedReps, seedUnits } = seed;
  if (seedWeight == null) {
    return seedReps == null ? '- × -' : `BW × ${seedReps}`;
  }
  const displayWeight = convertAndRoundWeight(seedWeight, seedUnits, displayUnits, weightStep);
  const weightStr = formatWeight(displayWeight, displayUnits);
  return `${weightStr} × ${seedReps ?? '-'}`;
}

/** How many seed rows RepeatCard shows before folding the rest into "+N more". */
const DISPLAY_LIMIT = 4;

function hasSeedValues(seed: ExerciseSeed): boolean {
  return seed.seedWeight != null || seed.seedReps != null;
}

export interface RepeatCardDisplay {
  /** The seeds to render as rows, already capped at DISPLAY_LIMIT. */
  seeds: ExerciseSeed[];
  /** Count for the "+N more" row — everything not shown, valued or not. */
  overflow: number;
  /**
   * True when NOT ONE seed in the whole list has a weight or reps value —
   * every row would otherwise read "- × -". In that case the figures column
   * is dropped and the card shows exercise names only.
   */
  namesOnly: boolean;
}

/**
 * Picks the seed rows RepeatCard renders. A seed with both weight and reps
 * null (no prior data for that exercise) is filtered out of the display
 * rather than shown as a "- × -" row — but it still counts toward overflow,
 * same as a valued seed pushed past the display limit: `overflow` is always
 * `seeds.length - displayed.length`, so "+N more" honestly reflects
 * everything the card isn't showing, filtered or merely hidden.
 *
 * If NO seed in the list has any values, filtering would empty the display
 * entirely (every row is null/null) — that's a names-only workout preview,
 * not a data-loss bug, so this falls back to showing the first
 * DISPLAY_LIMIT exercise names unfiltered, with figures omitted by the
 * caller (`namesOnly: true`).
 */
export function selectDisplaySeeds(seeds: ExerciseSeed[]): RepeatCardDisplay {
  const anyValued = seeds.some(hasSeedValues);
  if (!anyValued) {
    const displayed = seeds.slice(0, DISPLAY_LIMIT);
    return { seeds: displayed, overflow: seeds.length - displayed.length, namesOnly: true };
  }
  const displayed = seeds.filter(hasSeedValues).slice(0, DISPLAY_LIMIT);
  return { seeds: displayed, overflow: seeds.length - displayed.length, namesOnly: false };
}
