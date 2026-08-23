/**
 * Pure elapsed-seconds derivation for the rest clock (Batch 2 Task 1).
 * `RestProgressBar` self-ticks via `useRestClock`, which wraps this pure
 * function — tested directly here since the hook itself is just a
 * setInterval shell around it.
 *
 * Imports from `@/rest/restClock`, not `@/rest/RestProgressBar`: the latter
 * transitively pulls in react-native / react-native-reanimated, which this
 * project's ts-jest config doesn't transform (jest.setup.js: "tests are
 * pure TS"). `restClock.ts` holds the same exports RN-free for exactly this
 * reason.
 */
import { elapsedSecondsSince } from '@/rest/restClock';

test('null startedAt → 0', () => {
  expect(elapsedSecondsSince(null, Date.now())).toBe(0);
});

test('exact seconds elapsed', () => {
  const now = Date.now();
  expect(elapsedSecondsSince(now - 5_000, now)).toBe(5);
});

test('pre-start clock skew → clamped to 0', () => {
  const now = Date.now();
  // startedAt is in the future relative to `now` (clock skew) — must not go negative.
  expect(elapsedSecondsSince(now + 5_000, now)).toBe(0);
});
