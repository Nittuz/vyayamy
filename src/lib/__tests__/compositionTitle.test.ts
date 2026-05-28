import { compositionTitle } from '@/lib/compositionTitle';

describe('compositionTitle', () => {
  test('empty array → empty string', () => {
    expect(compositionTitle([])).toBe('');
  });

  test('single muscle group', () => {
    expect(compositionTitle(['Chest'])).toBe('Chest');
  });

  test('multiple unique muscle groups joined with " + "', () => {
    expect(compositionTitle(['Chest', 'Triceps', 'Shoulders'])).toBe('Chest + Triceps + Shoulders');
  });

  test('deduplicates case-insensitively', () => {
    expect(compositionTitle(['Chest', 'chest', 'CHEST'])).toBe('Chest');
  });

  test('preserves first-seen casing on dedupe', () => {
    expect(compositionTitle(['CHEST', 'chest', 'Chest'])).toBe('CHEST');
  });

  test('filters out null and undefined entries', () => {
    expect(compositionTitle(['Chest', null, 'Triceps', undefined])).toBe('Chest + Triceps');
  });

  test('filters out empty strings and whitespace-only', () => {
    expect(compositionTitle(['Chest', '', '   ', 'Triceps'])).toBe('Chest + Triceps');
  });

  test('preserves insertion order', () => {
    expect(compositionTitle(['Legs', 'Back', 'Chest'])).toBe('Legs + Back + Chest');
  });

  test('all null/empty input → empty string', () => {
    expect(compositionTitle([null, undefined, '', '   '])).toBe('');
  });
});
