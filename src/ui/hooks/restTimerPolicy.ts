/**
 * Pure restore-policy for the persisted rest timer.
 *
 * Separated from useRestTimer.ts so it can be unit-tested in Jest
 * (the project mocks react-native, so component-level testing isn't
 * available here).
 *
 * Storage shape lives here too — single source of truth.
 */

export interface PersistedTimer {
  schemaVersion: 1;
  startedAt: number; // epoch ms
  targetSeconds: number;
}

export const REST_TIMER_KEY = '@flexyug/rest-timer/v1';
export const REST_TIMER_SCHEMA_VERSION = 1 as const;

export function shouldRestoreTimer(
  persisted: PersistedTimer | null,
  now: number,
): { restore: boolean; clearStale: boolean } {
  if (!persisted) return { restore: false, clearStale: false };
  if (persisted.schemaVersion !== REST_TIMER_SCHEMA_VERSION) {
    return { restore: false, clearStale: true };
  }
  const elapsed = now - persisted.startedAt;
  if (elapsed < 0) return { restore: false, clearStale: true };
  if (elapsed > 2 * persisted.targetSeconds * 1000) {
    return { restore: false, clearStale: true };
  }
  return { restore: true, clearStale: false };
}
