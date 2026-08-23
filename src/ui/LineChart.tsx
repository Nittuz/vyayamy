/**
 * Blacktop SVG line chart — skin-aware, react-native-svg only.
 *
 * Built on react-native-svg (avoids the victory-native / React 19 peer
 * conflict; do NOT add victory/recharts/skia). One series over time: an
 * accentSoft area fill under a volt accent line, data-driven y-scaling (does
 * NOT force a 0 baseline, so real variation is visible), hard 2px axis rules
 * with faint gridlines, Geist Mono tick labels in compact notation (10000 →
 * "10k", so a 5-digit tick can never overflow the gutter and clip to "000"),
 * ink-ringed PR markers (chalk in dark, ink in light — volt stays reserved
 * for the line itself), and an optional tap-scrub read-out. Colors come from
 * the active skin via useTheme().
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { chartTicks, clampMarkerLabelX, formatCompactTick, xTickAnchor } from './chartTicks';
import { Text } from './Text';
import { useTheme } from './useTheme';

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

interface Props {
  data: ChartPoint[];
  width: number;
  height: number;
  yLabel?: string;
  xTickFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
  /** Appended to the top y-tick only, e.g. " kg" — keeps the axis uncluttered. */
  unitSuffix?: string;
  /** Data x-values that set a record; each is ringed in ink with a "PR" label. */
  markers?: { x: number }[];
  /**
   * When provided, the chart becomes tap-scrubbable: a Pan gesture maps touch x
   * to the nearest data point and reports it (null when the touch ends). Direct
   * manipulation — no Reduce Motion gate. Absent → behaves exactly as before.
   */
  onScrub?: (point: ChartPoint | null) => void;
  /** The currently scrubbed point (controlled by the parent), drawn emphasized. */
  scrubX?: number | null;
  /**
   * A11y summary for the whole chart (impeccable r2 wave 2 S4) — the chart is
   * generic (it doesn't know the metric name or units), so the caller builds
   * the words from the same data it already has in scope and passes them in.
   * Omit only when the caller has no meaningful summary to give (e.g. an
   * empty series where the "No data yet" text already speaks for itself).
   */
  accessibilityLabel?: string;
}

const PADDING = { top: 18, right: 16, bottom: 28, left: 44 };

export function LineChart({
  data,
  width,
  height,
  xTickFormatter = (v) => String(v),
  yTickFormatter = formatCompactTick,
  unitSuffix,
  markers,
  onScrub,
  scrubX = null,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();

  const chart = useMemo(() => {
    if (data.length === 0) return null;

    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);

    // Nice-number y axis with headroom; never a forced 0 baseline.
    const axis = chartTicks(rawMin, rawMax, 4);
    const yLo = axis.min;
    const yHi = axis.max;

    const xSpan = xMax - xMin || 1;
    const ySpan = yHi - yLo || 1;

    const w = width - PADDING.left - PADDING.right;
    const h = height - PADDING.top - PADDING.bottom;

    const scaleX = (x: number) =>
      data.length === 1 ? PADDING.left + w / 2 : PADDING.left + ((x - xMin) / xSpan) * w;
    const scaleY = (y: number) => PADDING.top + h - ((y - yLo) / ySpan) * h;

    const pointsAbs = data.map((d) => ({ x: scaleX(d.x), y: scaleY(d.y), d }));
    const linePath = pointsAbs
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    const baseY = PADDING.top + h;
    const first = pointsAbs[0]!;
    const last = pointsAbs[pointsAbs.length - 1]!;
    const areaPath = `${linePath} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;

    const yTicks = axis.ticks;
    const xTicks =
      data.length === 1
        ? [xMin]
        : [xMin, xMin + xSpan / 2, xMax].filter((v, i, arr) => arr.indexOf(v) === i);

    // Resolve each marker x to its nearest plotted point.
    const markerPoints = (markers ?? []).map((m) => {
      let best = pointsAbs[0]!;
      let bestDist = Math.abs(best.d.x - m.x);
      for (const p of pointsAbs) {
        const dist = Math.abs(p.d.x - m.x);
        if (dist < bestDist) {
          best = p;
          bestDist = dist;
        }
      }
      return best;
    });

    // Resolve the scrubbed x to its nearest plotted point.
    let scrubbed: (typeof pointsAbs)[number] | null = null;
    if (scrubX != null) {
      let best = pointsAbs[0]!;
      let bestDist = Math.abs(best.d.x - scrubX);
      for (const p of pointsAbs) {
        const dist = Math.abs(p.d.x - scrubX);
        if (dist < bestDist) {
          best = p;
          bestDist = dist;
        }
      }
      scrubbed = best;
    }

    return {
      pointsAbs,
      linePath,
      areaPath,
      scaleX,
      scaleY,
      yTicks,
      xTicks,
      yLo,
      yHi,
      last,
      baseY,
      markerPoints,
      scrubbed,
    };
  }, [data, width, height, markers, scrubX]);

  // Map a touch x (in chart coordinates) to the nearest data point and report it.
  const reportNearest = useMemo(() => {
    if (!onScrub) return undefined;
    return (touchX: number) => {
      if (!chart || data.length === 0) return;
      let best = chart.pointsAbs[0]!;
      let bestDist = Math.abs(best.x - touchX);
      for (const p of chart.pointsAbs) {
        const dist = Math.abs(p.x - touchX);
        if (dist < bestDist) {
          best = p;
          bestDist = dist;
        }
      }
      onScrub(best.d);
    };
  }, [onScrub, chart, data.length]);

  const panGesture = useMemo(() => {
    if (!onScrub || !reportNearest) return null;
    const clear = () => onScrub(null);
    return (
      Gesture.Pan()
        // Engage horizontally only so it doesn't fight the parent ScrollView.
        .activeOffsetX([-8, 8])
        .failOffsetY([-12, 12])
        .onBegin((e) => runOnJS(reportNearest)(e.x))
        .onUpdate((e) => runOnJS(reportNearest)(e.x))
        .onEnd(() => runOnJS(clear)())
        .onFinalize(() => runOnJS(clear)())
    );
  }, [onScrub, reportNearest]);

  if (!chart || data.length === 0) {
    return (
      <View style={[styles.empty, { width, height, backgroundColor: theme.color.bg }]}>
        <Text variant="meta" color={theme.color.inkTertiary}>
          No data yet
        </Text>
      </View>
    );
  }

  const svg = (
    <Svg width={width} height={height}>
      {/* faint horizontal gridlines at each nice tick row */}
      {chart.yTicks.map((t, i) => {
        const y = chart.scaleY(t);
        return (
          <Line
            key={`gy-${i}`}
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={y}
            y2={y}
            stroke={theme.color.border}
            strokeWidth={1}
          />
        );
      })}

      {/* area fill under the line */}
      <Path d={chart.areaPath} fill={theme.color.accentSoft} stroke="none" />

      {/* the line */}
      <Path
        d={chart.linePath}
        stroke={theme.color.accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* hard structural rules: baseline + left axis (2px borderStrong) */}
      <Line
        x1={PADDING.left}
        x2={width - PADDING.right}
        y1={chart.baseY}
        y2={chart.baseY}
        stroke={theme.color.borderStrong}
        strokeWidth={theme.depth.rule}
      />
      <Line
        x1={PADDING.left}
        x2={PADDING.left}
        y1={PADDING.top}
        y2={chart.baseY}
        stroke={theme.color.borderStrong}
        strokeWidth={theme.depth.rule}
      />

      {/* y-axis labels — Geist Mono; the top tick carries the unit suffix */}
      {chart.yTicks.map((t, i) => {
        const isTop = i === chart.yTicks.length - 1;
        const label = yTickFormatter(t) + (isTop && unitSuffix ? unitSuffix : '');
        return (
          <SvgText
            key={`ty-${i}`}
            x={PADDING.left - 8}
            y={chart.scaleY(t) + 3}
            fill={theme.color.inkTertiary}
            fontFamily={theme.font.family.mono}
            fontSize={10}
            textAnchor="end"
          >
            {label}
          </SvgText>
        );
      })}

      {/* x-axis labels — Geist Mono. Edge-aware anchor: the first tick starts
          at its own x and the last ends at its own x, so neither hangs past
          the plot's left gutter or clips off the right edge (owner review:
          the last label, e.g. "Aug 22", was clipping). */}
      {chart.xTicks.map((t, i) => (
        <SvgText
          key={`tx-${i}`}
          x={chart.scaleX(t)}
          y={height - PADDING.bottom + 18}
          fill={theme.color.inkTertiary}
          fontFamily={theme.font.family.mono}
          fontSize={10}
          textAnchor={xTickAnchor(i, chart.xTicks.length)}
        >
          {xTickFormatter(t)}
        </SvgText>
      ))}

      {/* data points */}
      {chart.pointsAbs.map((p, i) => (
        <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill={theme.color.accent} />
      ))}

      {/* PR markers: ink ring (chalk in dark, ink in light) + a tiny mono "PR"
          micro-label above — volt stays reserved for the line itself */}
      {chart.markerPoints.map((p, i) => (
        <Circle
          key={`mk-${i}`}
          cx={p.x}
          cy={p.y}
          r={6}
          fill="none"
          stroke={theme.color.ink}
          strokeWidth={2}
        />
      ))}
      {chart.markerPoints.map((p, i) => (
        <SvgText
          key={`ml-${i}`}
          // Clamped so a PR at the first data point doesn't crowd/overlap the
          // y-axis tick labels (owner review) — nudges right near the left
          // edge, left near the right edge; centered everywhere else.
          x={clampMarkerLabelX(p.x, PADDING.left, width - PADDING.right)}
          y={p.y - 12}
          fill={theme.color.ink}
          fontFamily={theme.font.family.mono}
          fontSize={8}
          textAnchor="middle"
        >
          PR
        </SvgText>
      ))}

      {/* emphasize the latest point (full-bleed chart sits on bg, not surface) */}
      <Circle
        cx={chart.last.x}
        cy={chart.last.y}
        r={4.5}
        fill={theme.color.accent}
        stroke={theme.color.bg}
        strokeWidth={2}
      />

      {/* scrub guide + emphasized dot at the scrubbed point */}
      {chart.scrubbed ? (
        <>
          <Line
            x1={chart.scrubbed.x}
            x2={chart.scrubbed.x}
            y1={PADDING.top}
            y2={chart.baseY}
            stroke={theme.color.accent}
            strokeWidth={1}
          />
          <Circle
            cx={chart.scrubbed.x}
            cy={chart.scrubbed.y}
            r={5.5}
            fill={theme.color.accent}
            stroke={theme.color.bg}
            strokeWidth={2}
          />
        </>
      ) : null}
    </Svg>
  );

  // Tap-scrub wraps the SVG in a Pan GestureDetector when onScrub is supplied;
  // otherwise the chart renders exactly as before (graceful degrade).
  const gestureWrapped = panGesture ? (
    <GestureDetector gesture={panGesture}>{svg}</GestureDetector>
  ) : (
    svg
  );

  // A raw Svg is invisible to screen readers — its individual shapes would
  // otherwise be silently skipped (no announcement at all) rather than read
  // as a chart (impeccable r2 wave 2 S4). `accessible` collapses the whole
  // subtree into one element carrying the caller-supplied summary.
  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {gestureWrapped}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
});
