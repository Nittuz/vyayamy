import { chartTicks, clampMarkerLabelX, formatCompactTick, xTickAnchor } from '@/ui/chartTicks';

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

  // Owner-review finding: a flat/near-flat series (e.g. a plateaued lift, or
  // bodyweight reps that never move) hugged one gridline under a big fill
  // slab — the plain 10%-of-span pad barely separated the line from its own
  // value. Low-variance series should pad relative to the data's own
  // magnitude instead, so the (still flat) line comfortably floats mid-plot.
  test('widens padding for a low-variance (near-flat) series so the line sits mid-plot', () => {
    const { min, max } = chartTicks(100, 100.5, 4);
    const dataMid = (100 + 100.5) / 2;
    const axisMid = (min + max) / 2;
    const axisSpan = max - min;
    // The axis center should land close to the data's own center, not off to
    // one side (which is what "hugging one gridline" looks like).
    expect(Math.abs(axisMid - dataMid)).toBeLessThan(axisSpan * 0.15);
    // And the band must be meaningfully wider than a naive 10%-of-span pad
    // would produce — proof the padding was actually widened, not just
    // coincidentally centered.
    expect(axisSpan).toBeGreaterThan((100.5 - 100) * 5);
  });

  test('a typical (non-flat) range is unaffected by the low-variance widening', () => {
    // Same range as the "chooses a nice step" test above — asserts the fix is
    // scoped to low-variance series and doesn't change ordinary axes.
    const { step } = chartTicks(82, 117, 4);
    expect([10, 20]).toContain(step);
  });

  test('exact-flat series (min === max) still centers the value, unaffected by the low-variance path', () => {
    const { min, max } = chartTicks(50, 50, 4);
    const axisMid = (min + max) / 2;
    expect(axisMid).toBeCloseTo(50, 6);
  });
});

describe('xTickAnchor', () => {
  test('the first of several ticks starts at its own x (never hangs off the left edge)', () => {
    expect(xTickAnchor(0, 3)).toBe('start');
  });

  test('the last of several ticks ends at its own x (never clips off the right edge)', () => {
    expect(xTickAnchor(2, 3)).toBe('end');
  });

  test('a tick strictly between the ends stays centered', () => {
    expect(xTickAnchor(1, 3)).toBe('middle');
  });

  test('a lone tick (single-point series) stays centered — it is both ends at once', () => {
    expect(xTickAnchor(0, 1)).toBe('middle');
  });

  test('two ticks: first starts, second ends — no middle case', () => {
    expect(xTickAnchor(0, 2)).toBe('start');
    expect(xTickAnchor(1, 2)).toBe('end');
  });
});

describe('clampMarkerLabelX', () => {
  const plotLeft = 44;
  const plotRight = 360;

  test('nudges a label right when its marker sits at the left plot edge (crowds the y-axis)', () => {
    const x = clampMarkerLabelX(plotLeft, plotLeft, plotRight);
    expect(x).toBeGreaterThan(plotLeft);
  });

  test('nudges a label left when its marker sits at the right plot edge', () => {
    const x = clampMarkerLabelX(plotRight, plotLeft, plotRight);
    expect(x).toBeLessThan(plotRight);
  });

  test('leaves a mid-plot marker label untouched', () => {
    const mid = (plotLeft + plotRight) / 2;
    expect(clampMarkerLabelX(mid, plotLeft, plotRight)).toBe(mid);
  });

  test('never places the label outside the plot bounds', () => {
    expect(clampMarkerLabelX(plotLeft, plotLeft, plotRight)).toBeGreaterThanOrEqual(plotLeft);
    expect(clampMarkerLabelX(plotRight, plotLeft, plotRight)).toBeLessThanOrEqual(plotRight);
  });

  test('degrades gracefully when the plot is narrower than the clamp margin', () => {
    const x = clampMarkerLabelX(50, 48, 52);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(48);
    expect(x).toBeLessThanOrEqual(52);
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
