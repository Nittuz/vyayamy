/**
 * Regression guard for deep-review finding #3:
 *   "HTTP 5xx/429 are classified as permanent failures — a brief Supabase
 *    outage quarantines valid user writes in ~30 seconds."
 *
 * Transient failures must NOT increment outbox attempts; only genuinely
 * permanent failures (constraint/RLS violations) should march toward
 * quarantine. A 500/503 gateway blip or a 429 rate-limit is transient.
 */
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
    expect(isTransientError({ status: 409, code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isTransientError({ status: 400, message: 'check constraint failed' })).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError('boom')).toBe(false);
  });
});
