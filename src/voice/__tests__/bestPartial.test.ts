/**
 * Evidence (simulator Voice log, 2026-10-04, second run): the partials for
 * "225 for 5" read "225", "225 for", "225 for five" — a perfect set — and
 * only THEN did Apple's number formatter fuse the utterance into "220 545",
 * which is also what every alternative in the N-best list carried. The
 * linguistic form exists in the partial stream; this tracker keeps the best
 * complete set seen there so the final cannot throw it away.
 */
import { BestPartialTracker, isTruncatedBy } from '@/voice/bestPartial';
import type { VoiceContext } from '@/voice/commands';

const ctx: VoiceContext = { units: 'lb', hasActiveExercise: true };

test('keeps the latest partial that parses as a complete set', () => {
  const t = new BestPartialTracker();
  for (const p of ['Two', '220', '225', '225 for', '225 for five', '220 545']) t.onPartial(p, ctx);
  expect(t.best()?.transcript).toBe('225 for five');
  expect(t.best()?.parsed.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
});

test('a later complete partial replaces an earlier one', () => {
  const t = new BestPartialTracker();
  t.onPartial('225 for 5', ctx);
  t.onPartial('225 for 8', ctx);
  expect(t.best()?.parsed.command).toEqual({ kind: 'setValues', weight: 225, reps: 8 });
});

test('bare numbers and half sets are not good enough', () => {
  const t = new BestPartialTracker();
  for (const p of ['225', '225 for', '5 reps']) t.onPartial(p, ctx);
  expect(t.best()).toBeNull();
});

test('reset forgets everything', () => {
  const t = new BestPartialTracker();
  t.onPartial('225 for 5', ctx);
  t.reset();
  expect(t.best()).toBeNull();
});

describe('isTruncatedBy: a partial cut off mid-number is not the set', () => {
  // "seven reps at two fifty" streamed "Seven reps at two" (a complete-looking
  // 2 × 7) before "Seven reps at 2:50"; the weight 2 is a prefix of 250.
  test('weight that is a proper digit prefix of a number in the final', () => {
    expect(isTruncatedBy(2, ['Seven reps at 2:50', 'Seven reps of 250'])).toBe(true);
    expect(isTruncatedBy(22, ['22545'])).toBe(true);
  });

  test('the fused "225 for five" case is kept: 225 is no prefix of 220 or 545', () => {
    expect(isTruncatedBy(225, ['220 545', '22 545', '220 5 for five'])).toBe(false);
  });

  test('an equal number is not a truncation', () => {
    expect(isTruncatedBy(250, ['Seven reps of 250'])).toBe(false);
  });
});
