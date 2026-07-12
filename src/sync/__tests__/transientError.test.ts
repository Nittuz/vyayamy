/**
 * Regression guard for deep-review finding #3:
 *   "HTTP 5xx/429 are classified as permanent failures — a brief Supabase
 *    outage quarantines valid user writes in ~30 seconds."
 *
 * Transient failures must NOT increment outbox attempts; only genuinely
 * permanent failures (constraint/RLS violations) should march toward
 * quarantine. A 500/503 gateway blip or a 429 rate-limit is transient.
 */
import { isTransientSyncMessage } from '@/core/syncHelpers';
import { isSyncError } from '@/ui/syncErrors';

import { isTransientError } from '../push';

// push.ts imports the supabase client (ESM-only expo-constants); stub it. The
// classifier under test never touches the client. (jest hoists this mock.)
jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));

describe('isTransientError', () => {
  test('auth failures are transient (session expiry must not quarantine writes)', () => {
    expect(isTransientError({ status: 401, message: 'JWT expired' })).toBe(true);
    expect(isTransientError({ status: 403, message: 'forbidden' })).toBe(true);
    expect(isTransientError({ code: 'PGRST301' })).toBe(true);
    expect(isTransientError({ message: 'Network request failed' })).toBe(true);
  });

  test('5xx server errors are transient (#3 — a brief outage must not quarantine)', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isTransientError({ status, message: 'Service Unavailable' })).toBe(true);
    }
  });

  test('429 rate-limit is transient (#3)', () => {
    expect(isTransientError({ status: 429, message: 'Too Many Requests' })).toBe(true);
  });

  test('5xx / rate-limit surfaced only in the message are still transient', () => {
    expect(isTransientError({ message: 'Service temporarily unavailable' })).toBe(true);
    expect(isTransientError({ message: 'rate limit exceeded' })).toBe(true);
  });

  test('constraint violations remain permanent (they must quarantine)', () => {
    expect(isTransientError({ status: 409, code: '23505', message: 'duplicate key value' })).toBe(
      false,
    );
    expect(isTransientError({ status: 400, message: 'check constraint failed' })).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError('boom')).toBe(false);
  });
});

/**
 * #42/#43 — single source of truth for transient message patterns.
 *
 * Before consolidation there were two disagreeing lists: push.ts (retry
 * classification) knew 'rate limit'/'temporarily unavailable' but not
 * 'enotfound'; ui/syncErrors.ts (toast suppression) knew 'enotfound' but not
 * 'rate limit'. This matrix pins the UNION on the shared message classifier
 * and verifies both consumers agree on it, while the UI-only patterns
 * ('pushoutbox'/'pulloutbox') never leak into push retry classification.
 */
describe('transient message classification (union of both former lists)', () => {
  const TRANSIENT_MESSAGES = [
    'Network request failed',
    'Failed to fetch',
    'fetch failed',
    'TIMEOUT',
    'ECONNREFUSED',
    'econnreset',
    'getaddrinfo ENOTFOUND supabase.co',
    'JWT expired',
    'rate limit exceeded',
    'Too Many Requests',
    'Service temporarily unavailable',
    'service unavailable',
  ];

  const NON_TRANSIENT_MESSAGES = [
    'duplicate key value violates unique constraint',
    'check constraint failed',
    'Failed to add exercise',
    'Exercise not found',
    'null value in column "user_id"',
    '',
  ];

  test.each(TRANSIENT_MESSAGES)('"%s" is transient in ALL classifiers', (msg) => {
    expect(isTransientSyncMessage(msg)).toBe(true);
    expect(isTransientError({ message: msg })).toBe(true);
    expect(isSyncError(msg)).toBe(true);
  });

  test.each(NON_TRANSIENT_MESSAGES)('"%s" is transient in NO classifier', (msg) => {
    expect(isTransientSyncMessage(msg)).toBe(false);
    expect(isTransientError({ message: msg })).toBe(false);
    expect(isSyncError(msg)).toBe(false);
  });

  test('HTTP status / PGRST codes still classify without any message', () => {
    for (const status of [429, 500, 503]) {
      expect(isTransientError({ status })).toBe(true);
    }
    expect(isTransientError({ code: 'PGRST301' })).toBe(true);
    expect(isTransientError({ code: 'PGRST302' })).toBe(true);
  });

  test('UI-only patterns suppress toasts but do NOT affect push retry classification', () => {
    for (const msg of ['pushOutbox failed', 'pullOutbox failed']) {
      expect(isSyncError(msg)).toBe(true); // toast suppressed
      expect(isTransientSyncMessage(msg)).toBe(false); // not in the shared list
      expect(isTransientError({ message: msg })).toBe(false); // push would quarantine-march it
    }
  });
});
