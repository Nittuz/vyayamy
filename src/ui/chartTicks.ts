/**
 * "Nice numbers" y-axis tick generator (pure — no react-native imports, so it is
 * unit-testable and is the merge gate for the chart's axis quality).
 *
 * Given a data range [min, max] and a desired tick count, it returns an ascending
 * array of round tick values whose step is a "nice" number (1 / 2 / 2.5 / 5 × 10^n)
 * and whose span covers the data with a little headroom. It intentionally does NOT
 * force a 0 baseline — the chart shows real variation, so the axis floats with the
 * data (a heavy-lift history hovering 80–100 kg should not be flattened against 0).
 */

/** Round a number up/down to a "nice" 1/2/2.5/5/10 × 10^n value. */
function niceNum(range: number, round: boolean): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

export interface ChartTicks {
  /** Ascending "nice" tick values. */
  ticks: number[];
  /** The axis low bound (≤ data min) — the first tick. */
  min: number;
  /** The axis high bound (≥ data max) — the last tick. */
  max: number;
  /** The chosen nice step between ticks. */
  step: number;
}

/**
 * Generate nice y-axis ticks for a data range.
 *
 * @param dataMin   smallest data value
 * @param dataMax   largest data value
 * @param desiredCount approximate number of ticks (default 4); the actual count
 *                  lands near this once the step is rounded to a nice number.
 */
export function chartTicks(dataMin: number, dataMax: number, desiredCount = 4): ChartTicks {
  const count = Math.max(2, Math.round(desiredCount));

  // Degenerate / flat input: fabricate a small symmetric band so a single point
  // (or a perfectly flat series) still draws a readable axis instead of dividing
  // by zero. Never forces 0.
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax) || dataMin === dataMax) {
    const center = Number.isFinite(dataMin) ? dataMin : 0;
    const pad = Math.max(1, Math.abs(center) * 0.1);
    const step = niceNum((pad * 2) / (count - 1) || 1, true);
    const min = Math.floor((center - pad) / step) * step;
    const max = Math.ceil((center + pad) / step) * step;
    return { ...buildTicks(min, max, step), step };
  }

  const lo = Math.min(dataMin, dataMax);
  const hi = Math.max(dataMin, dataMax);

  // Headroom both sides so the line never kisses the frame — the chart shows
  // variation, so a touch of breathing room reads as "this is the real spread".
  const pad = (hi - lo) * 0.1;
  const paddedLo = lo - pad;
  const paddedHi = hi + pad;

  const range = niceNum(paddedHi - paddedLo, false);
  const step = niceNum(range / (count - 1), true);
  const min = Math.floor(paddedLo / step) * step;
  const max = Math.ceil(paddedHi / step) * step;

  return { ...buildTicks(min, max, step), step };
}

/**
 * Compact mono tick label: 10000 → "10k", 2500 → "2.5k", 1000000 → "1M";
 * sub-1000 values pass through with a trailing ".0" trimmed.
 *
 * Fixes the device-observed axis bug where a 5-digit top tick ("10000 kg")
 * overflowed the chart's fixed left gutter and clipped to "000 kg". Keeps up
 * to two decimals so close-together thousand-scale ticks (9950 vs 10000)
 * never collapse into the same label.
 */
export function formatCompactTick(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trimNum(value / 1_000_000)}M`;
  if (abs >= 1000) return `${trimNum(value / 1000)}k`;
  return trimNum(value);
}

function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function buildTicks(min: number, max: number, step: number): Omit<ChartTicks, 'step'> {
  const ticks: number[] = [];
  // Guard against floating-point drift accumulating an extra/short tick.
  const epsilon = step * 1e-6;
  for (let v = min; v <= max + epsilon; v += step) {
    // Snap to the step grid to clear binary-float fuzz (e.g. 0.1 + 0.2).
    ticks.push(Math.round(v / step) * step);
  }
  // Ensure at least the two endpoints exist even if the loop under-produced.
  if (ticks.length < 2) {
    return { ticks: [min, max], min, max };
  }
  return { ticks, min: ticks[0]!, max: ticks[ticks.length - 1]! };
}
