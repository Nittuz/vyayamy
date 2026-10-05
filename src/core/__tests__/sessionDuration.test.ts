import { effectiveSessionWindow, OPEN_SESSION_GAP_MS } from '@/core/sessionDuration';

const t = (minutesAfterStart: number) =>
  new Date(Date.UTC(2026, 6, 13, 10, 0) + minutesAfterStart * 60_000).toISOString();
const start = t(0);
const gap = OPEN_SESSION_GAP_MS / 60_000;

test('a session lifted start to finish keeps its real window', () => {
  expect(effectiveSessionWindow(start, t(45), t(3), t(40))).toEqual({ start, end: t(45) });
});

test('a session left open for days ends at its last logged set', () => {
  const fiveDaysLater = t(5 * 24 * 60 + 7 * 60);
  expect(effectiveSessionWindow(start, fiveDaysLater, t(3), t(25))).toEqual({
    start,
    end: t(25),
  });
});

test('a session opened long before its first set starts at that set', () => {
  // Opened at 01:46, sets logged from 16:50, finished 16:56 (simulator data).
  expect(effectiveSessionWindow(start, t(910), t(904), t(909))).toEqual({
    start: t(904),
    end: t(910),
  });
});

test('both ends can move: abandoned, then lifted days later, then finished', () => {
  const day5 = 5 * 24 * 60;
  expect(effectiveSessionWindow(start, t(day5 + 10), t(day5), t(day5 + 2))).toEqual({
    start: t(day5),
    end: t(day5 + 10),
  });
});

test('the gap threshold is the boundary', () => {
  expect(effectiveSessionWindow(start, t(30 + gap), t(1), t(30)).end).toBe(t(30 + gap));
  expect(effectiveSessionWindow(start, t(31 + gap), t(1), t(30)).end).toBe(t(30));
  expect(effectiveSessionWindow(start, t(gap + 5), t(gap), t(gap + 2)).start).toBe(start);
  expect(effectiveSessionWindow(start, t(gap + 6), t(gap + 1), t(gap + 2)).start).toBe(t(gap + 1));
});

test('no sets or no end: nothing to cap', () => {
  expect(effectiveSessionWindow(start, t(60), null, null)).toEqual({ start, end: t(60) });
  expect(effectiveSessionWindow(start, null, t(10), t(20))).toEqual({ start, end: null });
});

test('set times outside the session are ignored', () => {
  expect(effectiveSessionWindow(start, t(600), t(-5), t(700))).toEqual({ start, end: t(600) });
});
