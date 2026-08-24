import { stripText, formatSeed, selectDisplaySeeds } from '@/components/repeatCardFormat';
import type { ExerciseSeed } from '@/queries/repeatLastWorkout';

function seed(overrides: Partial<ExerciseSeed> = {}): ExerciseSeed {
  return {
    exerciseId: 'e1',
    exerciseName: 'Bench Press',
    seedWeight: null,
    seedReps: null,
    seedUnits: null,
    ...overrides,
  };
}

describe('stripText', () => {
  test('daysAgo 0 reads "Today"', () => {
    expect(stripText(0, 3)).toBe('Today · 3 exercises');
  });

  test('daysAgo 1 is singular "1 day ago"', () => {
    expect(stripText(1, 3)).toBe('1 day ago · 3 exercises');
  });

  test('daysAgo n reads "n days ago"', () => {
    expect(stripText(5, 3)).toBe('5 days ago · 3 exercises');
  });

  test('exerciseCount 1 is singular "1 exercise"', () => {
    expect(stripText(2, 1)).toBe('2 days ago · 1 exercise');
  });

  test('exerciseCount n is plural "n exercises"', () => {
    expect(stripText(2, 7)).toBe('2 days ago · 7 exercises');
  });
});

describe('formatSeed', () => {
  test('weight + reps + kg units, same display unit', () => {
    expect(formatSeed(seed({ seedWeight: 52.5, seedReps: 3, seedUnits: 'kg' }), 'kg', 2.5)).toBe(
      '52.5 kg × 3',
    );
  });

  test('null weight, units null falls back to DEFAULT_UNITS-free BW branch', () => {
    expect(formatSeed(seed({ seedWeight: null, seedReps: 12, seedUnits: null }), 'kg', 2.5)).toBe(
      'BW × 12',
    );
  });

  test('both weight and reps null', () => {
    expect(formatSeed(seed({ seedWeight: null, seedReps: null, seedUnits: null }), 'kg', 2.5)).toBe(
      '- × -',
    );
  });

  test('lb seed, same display unit renders lb', () => {
    expect(formatSeed(seed({ seedWeight: 100, seedReps: 5, seedUnits: 'lb' }), 'lb', 5)).toBe(
      '100 lb × 5',
    );
  });

  test('weight present, units null falls back to DEFAULT_UNITS (kg)', () => {
    expect(formatSeed(seed({ seedWeight: 60, seedReps: 8, seedUnits: null }), 'kg', 2.5)).toBe(
      '60 kg × 8',
    );
  });

  test('weight present, reps null keeps the dash on the reps side', () => {
    expect(formatSeed(seed({ seedWeight: 40, seedReps: null, seedUnits: 'kg' }), 'kg', 2.5)).toBe(
      '40 kg × -',
    );
  });

  // task-1 §(d): the preview must show what Start will actually seed — a
  // kg-logged history seed under an lb profile converts+rounds at format
  // time, exactly like repeatLastWorkout/startPlannedWorkout do at creation.
  test('kg-history seed under an lb display unit converts and rounds (52.5 kg @ step 5 lb)', () => {
    // 52.5 kg = 115.74... lb -> nearest 5 = 115 (computed from the real
    // convertWeight/round helpers, not hand-picked).
    expect(formatSeed(seed({ seedWeight: 52.5, seedReps: 3, seedUnits: 'kg' }), 'lb', 5)).toBe(
      '115 lb × 3',
    );
  });

  test('same display unit still rounds to the step (53 kg @ step 2.5 -> 52.5)', () => {
    expect(formatSeed(seed({ seedWeight: 53, seedReps: 5, seedUnits: 'kg' }), 'kg', 2.5)).toBe(
      '52.5 kg × 5',
    );
  });
});

describe('selectDisplaySeeds', () => {
  const valued = (n: number) => seed({ exerciseId: `v${n}`, seedWeight: n, seedReps: 5 });
  const empty = (n: number) => seed({ exerciseId: `e${n}`, seedWeight: null, seedReps: null });

  test('all valued, at or under the limit: shown as-is, no overflow', () => {
    const seeds = [valued(1), valued(2), valued(3)];
    expect(selectDisplaySeeds(seeds)).toEqual({ seeds, overflow: 0, namesOnly: false });
  });

  test('all valued, over the limit: first 4 shown, rest counted as overflow', () => {
    const seeds = [valued(1), valued(2), valued(3), valued(4), valued(5), valued(6)];
    const result = selectDisplaySeeds(seeds);
    expect(result.seeds).toEqual(seeds.slice(0, 4));
    expect(result.overflow).toBe(2);
    expect(result.namesOnly).toBe(false);
  });

  test('a null/null seed is filtered out of the display, not shown as "- x -"', () => {
    const seeds = [valued(1), empty(1), valued(2)];
    const result = selectDisplaySeeds(seeds);
    expect(result.seeds).toEqual([valued(1), valued(2)]);
    expect(result.overflow).toBe(1);
    expect(result.namesOnly).toBe(false);
  });

  test('overflow counts BOTH filtered null/null seeds and valued seeds pushed past the limit', () => {
    // 6 valued + 2 null/null = 8 seeds; first 4 valued are shown.
    const seeds = [
      valued(1),
      empty(1),
      valued(2),
      valued(3),
      valued(4),
      empty(2),
      valued(5),
      valued(6),
    ];
    const result = selectDisplaySeeds(seeds);
    expect(result.seeds).toEqual([valued(1), valued(2), valued(3), valued(4)]);
    // 2 valued-hidden (5, 6) + 2 filtered (the two null/null seeds) = 4.
    expect(result.overflow).toBe(4);
    expect(result.namesOnly).toBe(false);
  });

  test('no seed has any values: falls back to names-only, first 4 + overflow, nothing filtered', () => {
    const seeds = [empty(1), empty(2), empty(3), empty(4), empty(5)];
    const result = selectDisplaySeeds(seeds);
    expect(result.seeds).toEqual(seeds.slice(0, 4));
    expect(result.overflow).toBe(1);
    expect(result.namesOnly).toBe(true);
  });

  test('empty seed list', () => {
    expect(selectDisplaySeeds([])).toEqual({ seeds: [], overflow: 0, namesOnly: true });
  });
});
