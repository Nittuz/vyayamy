import { relativeAge } from '@/sync/outboxPreview';

// outboxPreview -> push -> supabase pulls in expo-constants (ESM), which ts-jest
// can't parse under Node. Mock the client like the other sync suites do.
jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const NOW = new Date('2026-05-31T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeAge', () => {
  test('formats seconds', () => {
    expect(relativeAge(ago(5 * SEC), NOW)).toBe('5s ago');
  });

  test('formats minutes', () => {
    expect(relativeAge(ago(3 * MIN), NOW)).toBe('3m ago');
  });

  test('formats hours', () => {
    expect(relativeAge(ago(5 * HOUR), NOW)).toBe('5h ago');
  });

  test('formats days', () => {
    expect(relativeAge(ago(2 * DAY), NOW)).toBe('2d ago');
  });

  test('clamps future and invalid timestamps to "just now"', () => {
    expect(relativeAge(ago(-60 * SEC), NOW)).toBe('just now');
    expect(relativeAge('not-a-date', NOW)).toBe('just now');
  });
});
