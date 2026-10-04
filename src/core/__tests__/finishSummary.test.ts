import { finishSummaryAction } from '@/core/finishSummary';

test('a session with logged sets finishes', () => {
  expect(finishSummaryAction(1)).toBe('finish');
  expect(finishSummaryAction(12)).toBe('finish');
});

test('a session with nothing logged is discarded, not finished', () => {
  expect(finishSummaryAction(0)).toBe('discard');
});
