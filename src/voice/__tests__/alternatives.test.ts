/**
 * Apple's recognizer returns an N-best list. Its top hypothesis fuses digits
 * ("225 for 5" → "220 545", simulator Voice log 2026-10-04) while the word
 * form survives lower in the list. Pick the best-parsing alternative, not
 * the first transcript.
 */
import { pickBestParse } from '@/voice/alternatives';
import type { VoiceContext } from '@/voice/commands';

const ctx: VoiceContext = { units: 'lb', hasActiveExercise: true };

test('a fused top hypothesis loses to an alternative that parses as a full set', () => {
  const pick = pickBestParse(['220 545', '225 for 5', '225 45'], ctx);
  expect(pick?.transcript).toBe('225 for 5');
  expect(pick?.parsed.command).toEqual({ kind: 'setValues', weight: 225, reps: 5 });
  expect(pick?.parsed.confidence).toBe('high');
});

test('a full high-confidence set beats an earlier low-confidence bare number', () => {
  const pick = pickBestParse(['225', '225 for 5'], ctx);
  expect(pick?.transcript).toBe('225 for 5');
});

test('with no full set anywhere, the first alternative that parses at all wins', () => {
  const pick = pickBestParse(['zzz', '225', '5 reps'], ctx);
  expect(pick?.transcript).toBe('225');
});

test('a control command in the top hypothesis is kept', () => {
  const pick = pickBestParse(['stop', '225 for 5'], ctx);
  expect(pick?.parsed.command).toEqual({ kind: 'stop' });
});

test('nothing parses → null', () => {
  expect(pickBestParse(['', 'zzz'], ctx)).toBeNull();
  expect(pickBestParse([], ctx)).toBeNull();
});
