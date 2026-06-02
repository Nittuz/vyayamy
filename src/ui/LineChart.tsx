/**
 * Minimalist SVG line chart — skin-aware.
 *
 * Built on react-native-svg (avoids the victory-native / React 19 peer
 * conflict). One series over time: soft area fill under a rounded accent line,
 * data-driven y-scaling (does NOT force a 0 baseline, so real variation is
 * visible), light gridlines, and an emphasized latest point. Colors come from
 * the active skin via useTheme().
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

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
}

const PADDING = { top: 16, right: 14, bottom: 26, left: 40 };

export function LineChart({
  data,
  width,
  height,
  xTickFormatter = (v) => String(v),
  yTickFormatter = (v) => String(Math.round(v)),
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
    // Data-driven range with headroom both sides; never a forced 0 baseline.
    const range = rawMax - rawMin;
    const pad = range === 0 ? Math.max(1, Math.abs(rawMax) * 0.1 || 1) : range * 0.18;
    const yLo = rawMin - pad;
    const yHi = rawMax + pad;

    const xSpan = xMax - xMin || 1;
    const ySpan = yHi - yLo || 1;

    const w = width - PADDING.left - PADDING.right;
    const h = height - PADDING.top - PADDING.bottom;

    const scaleX = (x: number) =>
      data.length === 1 ? PADDING.left + w / 2 : PADDING.left + ((x - xMin) / xSpan) * w;
    const scaleY = (y: number) => PADDING.top + h - ((y - yLo) / ySpan) * h;

    const pointsAbs = data.map((d) => ({ x: scaleX(d.x), y: scaleY(d.y) }));
    const linePath = pointsAbs
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    // Area = line, then down to the baseline and back to the start.
    const baseY = PADDING.top + h;
    const first = pointsAbs[0]!;
    const last = pointsAbs[pointsAbs.length - 1]!;
    const areaPath = `${linePath} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;

    const yTicks = [yLo + ySpan * 0.15, yLo + ySpan / 2, yHi - ySpan * 0.15];
    const xTicks =
      data.length === 1
        ? [xMin]
        : [xMin, xMin + xSpan / 2, xMax].filter((v, i, arr) => arr.indexOf(v) === i);

    return { pointsAbs, linePath, areaPath, scaleX, scaleY, yTicks, xTicks, last };
  }, [data, width, height]);

  if (!chart || data.length === 0) {
    return (
      <View
        style={[
          styles.empty,
          { width, height, backgroundColor: theme.color.bg, borderRadius: theme.radius.md },
        ]}
      >
        <Text style={{ color: theme.color.inkTertiary, fontSize: theme.font.size.meta }}>
          No data yet
        </Text>
      </View>
    );
  }

  return (
    <Svg width={width} height={height}>
      {/* horizontal gridlines */}
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

      {/* y-axis labels */}
      {chart.yTicks.map((t, i) => (
        <SvgText
          key={`ty-${i}`}
          x={PADDING.left - 8}
          y={chart.scaleY(t) + 3}
          fill={theme.color.inkTertiary}
          fontSize={10}
          textAnchor="end"
        >
          {yTickFormatter(t)}
        </SvgText>
      ))}

      {/* x-axis labels */}
      {chart.xTicks.map((t, i) => (
        <SvgText
          key={`tx-${i}`}
          x={chart.scaleX(t)}
          y={height - PADDING.bottom + 16}
          fill={theme.color.inkTertiary}
          fontSize={10}
          textAnchor="middle"
        >
          {xTickFormatter(t)}
        </SvgText>
      ))}

      {/* data points */}
      {chart.pointsAbs.map((p, i) => (
        <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill={theme.color.accent} />
      ))}

      {/* emphasize the latest point */}
      <Circle
        cx={chart.last.x}
        cy={chart.last.y}
        r={4.5}
        fill={theme.color.accent}
        stroke={theme.color.surface}
        strokeWidth={2}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
});
