import { stripText, formatSeed } from '@/components/repeatCardFormat';
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
  test('weight + reps + kg units', () => {
    expect(formatSeed(seed({ seedWeight: 52.5, seedReps: 3, seedUnits: 'kg' }))).toBe(
      '52.5 kg × 3',
    );
  });

  test('null weight, units null falls back to DEFAULT_UNITS-free BW branch', () => {
    expect(formatSeed(seed({ seedWeight: null, seedReps: 12, seedUnits: null }))).toBe('BW × 12');
  });

  test('both weight and reps null', () => {
    expect(formatSeed(seed({ seedWeight: null, seedReps: null, seedUnits: null }))).toBe('- × -');
  });

  test('lb seed renders lb', () => {
    expect(formatSeed(seed({ seedWeight: 100, seedReps: 5, seedUnits: 'lb' }))).toBe('100 lb × 5');
  });

  test('weight present, units null falls back to DEFAULT_UNITS (kg)', () => {
    expect(formatSeed(seed({ seedWeight: 60, seedReps: 8, seedUnits: null }))).toBe('60 kg × 8');
  });

  test('weight present, reps null keeps the dash on the reps side', () => {
    expect(formatSeed(seed({ seedWeight: 40, seedReps: null, seedUnits: 'kg' }))).toBe('40 kg × -');
  });
});
