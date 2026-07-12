import { chartTicks, formatCompactTick } from '@/ui/chartTicks';

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

describe('formatCompactTick', () => {
  test('device-observed truncation: a 10000 top tick reads "10k", never "000"', () => {
    // Seen live on device: a best-set-volume series produced a 10000 top tick,
    // whose "10000 kg" label overflowed the fixed left gutter and clipped to
    // "000 kg". The volume range below reproduces that exact axis.
    const { max, ticks } = chartTicks(6000, 9500, 4);
    expect(max).toBe(10000);
    expect(formatCompactTick(max)).toBe('10k');
    // No tick on this axis may render wider than the gutter budget (~6 chars).
    for (const t of ticks) {
      expect(formatCompactTick(t).length).toBeLessThanOrEqual(6);
    }
  });

  test('thousands compact with up to two decimals', () => {
    expect(formatCompactTick(1000)).toBe('1k');
    expect(formatCompactTick(2500)).toBe('2.5k');
    expect(formatCompactTick(12500)).toBe('12.5k');
    // Two decimals keep close-together thousand-scale ticks distinct.
    expect(formatCompactTick(9950)).toBe('9.95k');
  });

  test('sub-1000 values pass through with ".0" trimmed', () => {
    expect(formatCompactTick(950)).toBe('950');
    expect(formatCompactTick(102.5)).toBe('102.5');
    expect(formatCompactTick(100.0)).toBe('100');
    expect(formatCompactTick(0)).toBe('0');
  });

  test('negative values keep their sign', () => {
    expect(formatCompactTick(-1500)).toBe('-1.5k');
    expect(formatCompactTick(-30)).toBe('-30');
  });

  test('millions compact to M', () => {
    expect(formatCompactTick(1_000_000)).toBe('1M');
    expect(formatCompactTick(2_500_000)).toBe('2.5M');
  });

  test('every tick of a large-range axis stays within the gutter budget', () => {
    const { ticks } = chartTicks(0, 95000, 4);
    for (const t of ticks) {
      expect(formatCompactTick(t).length).toBeLessThanOrEqual(6);
    }
  });
});
