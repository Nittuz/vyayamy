import { chartTicks } from '@/ui/chartTicks';

const NICE_FRACTIONS = [1, 2, 2.5, 5];

/** A step is "nice" when it is 1/2/2.5/5 × 10^n for some integer n. */
function isNiceStep(step: number): boolean {
  expect(step).toBeGreaterThan(0);
  const exponent = Math.floor(Math.log10(step));
  const fraction = step / Math.pow(10, exponent);
  return NICE_FRACTIONS.some((f) => Math.abs(fraction - f) < 1e-6);
}

function isAscending(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! <= arr[i - 1]!) return false;
  }
  return true;
}

describe('chartTicks', () => {
  test('chooses a nice step for a typical range', () => {
    const { ticks, step } = chartTicks(82, 117, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    // A ~35-wide range across ~4 ticks lands on a 10-or-20 nice step.
    expect([10, 20]).toContain(step);
  });

  test('ticks are strictly ascending', () => {
    const { ticks } = chartTicks(3, 47, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(isAscending(ticks)).toBe(true);
  });

  test('every step between ticks is the same nice step', () => {
    const { ticks, step } = chartTicks(12, 88, 4);
    expect(isNiceStep(step)).toBe(true);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(step, 6);
    }
  });

  test('range covers the data (with headroom, both sides)', () => {
    const { min, max } = chartTicks(82, 117, 4);
    expect(min).toBeLessThanOrEqual(82);
    expect(max).toBeGreaterThanOrEqual(117);
  });

  test('does not force a 0 baseline for a floating series', () => {
    const { min } = chartTicks(80, 100, 4);
    // The axis should float near the data, not be dragged down to 0.
    expect(min).toBeGreaterThan(0);
  });

  test('handles min === max (flat series) without dividing by zero', () => {
    const { ticks, min, max, step } = chartTicks(50, 50, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(50);
    expect(max).toBeGreaterThanOrEqual(50);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  test('handles a single tiny value', () => {
    const { ticks, min, max, step } = chartTicks(0.5, 0.5, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(0.5);
    expect(max).toBeGreaterThanOrEqual(0.5);
  });

  test('handles a very small range', () => {
    const { ticks, min, max, step } = chartTicks(2.0, 2.4, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(2.0);
    expect(max).toBeGreaterThanOrEqual(2.4);
  });

  test('handles a very large range', () => {
    const { ticks, min, max, step } = chartTicks(0, 95000, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(95000);
  });

  test('handles negative ranges', () => {
    const { ticks, min, max, step } = chartTicks(-30, -5, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(-30);
    expect(max).toBeGreaterThanOrEqual(-5);
  });

  test('handles reversed (min > max) args defensively', () => {
    const { ticks, min, max } = chartTicks(117, 82, 4);
    expect(isAscending(ticks)).toBe(true);
    expect(min).toBeLessThanOrEqual(82);
    expect(max).toBeGreaterThanOrEqual(117);
  });

  test('produces a tick count in the neighborhood of the desired count', () => {
    const { ticks } = chartTicks(0, 100, 4);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  test('non-finite input degrades to a readable band', () => {
    const { ticks, step } = chartTicks(NaN, NaN, 4);
    expect(isNiceStep(step)).toBe(true);
    expect(isAscending(ticks)).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});
