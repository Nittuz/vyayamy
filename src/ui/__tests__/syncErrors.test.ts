import { isSyncError } from '@/ui/syncErrors';

describe('isSyncError', () => {
  test('network error', () => {
    expect(isSyncError('Network request failed')).toBe(true);
  });
  test('fetch error', () => {
    expect(isSyncError('Failed to fetch')).toBe(true);
  });
  test('econn error', () => {
    expect(isSyncError('ECONNREFUSED')).toBe(true);
  });
  test('case-insensitive', () => {
    expect(isSyncError('TIMEOUT')).toBe(true);
  });
  test('user-facing validation NOT a sync error', () => {
    expect(isSyncError('Failed to add exercise')).toBe(false);
  });
  test('exercise-not-found NOT a sync error', () => {
    expect(isSyncError('Exercise not found')).toBe(false);
  });
});
