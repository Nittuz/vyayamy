import { formatClock } from '@/core/format';
test('formats seconds as m:ss', () => {
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(9)).toBe('0:09');
  expect(formatClock(83)).toBe('1:23');
  expect(formatClock(120)).toBe('2:00');
  expect(formatClock(599)).toBe('9:59');
});
test('clamps negatives and rounds', () => {
  expect(formatClock(-5)).toBe('0:00');
  expect(formatClock(59.6)).toBe('1:00');
});
