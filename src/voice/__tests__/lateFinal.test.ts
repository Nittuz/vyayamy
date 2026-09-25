/**
 * Server-based recognition (the iOS 27 fallback) sends its final transcript
 * only after audio ends — i.e. AFTER the user releases the mic. Build 11 on
 * device: the card showed the words but nothing was logged, because the
 * engine dropped its listeners on stop. The tracker decides what a session
 * still owes when the recognizer reports 'end': the last unfinalized partial.
 */
import { LateFinalTracker } from '@/voice/lateFinal';

test('a partial with no final behind it is promoted to a final on end', () => {
  const t = new LateFinalTracker();
  t.onResult({ transcript: '225 for 5', isFinal: false });
  expect(t.onEnd()).toEqual({ transcript: '225 for 5', isFinal: true, confidence: undefined });
});

test('a final already delivered is not repeated on end', () => {
  const t = new LateFinalTracker();
  t.onResult({ transcript: '225 for 5', isFinal: false });
  t.onResult({ transcript: '225 for 5', isFinal: true, confidence: 0.9 });
  expect(t.onEnd()).toBeNull();
});

test('nothing heard means nothing owed', () => {
  expect(new LateFinalTracker().onEnd()).toBeNull();
});

test('speech after a final starts a new debt', () => {
  const t = new LateFinalTracker();
  t.onResult({ transcript: '225 for 5', isFinal: true });
  t.onResult({ transcript: 'done', isFinal: false });
  expect(t.onEnd()).toEqual({ transcript: 'done', isFinal: true, confidence: undefined });
});

test('end settles the debt once', () => {
  const t = new LateFinalTracker();
  t.onResult({ transcript: 'rest', isFinal: false });
  expect(t.onEnd()).not.toBeNull();
  expect(t.onEnd()).toBeNull();
});
