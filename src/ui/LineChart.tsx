/**
 * Minimalist SVG line chart.
 *
 * Built on react-native-svg to avoid the victory-native / React 19
 * peer conflict. Handles the one chart the product actually needs
 * for Phase 4: a single-series line over time, with axis ticks.
 * Aesthetics match the warm-neutral theme.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { theme } from './theme';

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

interface Props {
  data: ChartPoint[];
  width: number;
  height: number;
  /** Horizontal/vertical axis labels. Axis is auto-scaled. */
  yLabel?: string;
  xTickFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
}

const PADDING = { top: 16, right: 12, bottom: 28, left: 40 };

export function LineChart({
  data,
  width,
  height,
  xTickFormatter = (v) => String(v),
  yTickFormatter = (v) => String(Math.round(v)),
}: Props) {
  const chart = useMemo(() => {
    if (data.length === 0) return null;

    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys, 0);
    const yMax = Math.max(...ys);
    const yPad = Math.max(1, (yMax - yMin) * 0.12);

    const xSpan = xMax - xMin || 1;
    const ySpan = yMax + yPad - yMin || 1;

    const w = width - PADDING.left - PADDING.right;
    const h = height - PADDING.top - PADDING.bottom;

    const scaleX = (x: number) => PADDING.left + ((x - xMin) / xSpan) * w;
    const scaleY = (y: number) => PADDING.top + h - ((y - yMin) / ySpan) * h;

    const pointsAbs = data.map((d) => ({ x: scaleX(d.x), y: scaleY(d.y) }));
    const path = pointsAbs
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    const yTicks = [yMin, yMin + ySpan / 2, yMax + yPad];
    const xTicks =
      data.length === 1
        ? [xMin]
        : [xMin, xMin + xSpan / 2, xMax].filter((v, i, arr) => arr.indexOf(v) === i);

    return { pointsAbs, path, scaleX, scaleY, yTicks, xTicks, w, h };
  }, [data, width, height]);

  if (!chart || data.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }

  return (
    <Svg width={width} height={height}>
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

      {chart.yTicks.map((t, i) => (
        <SvgText
          key={`ty-${i}`}
          x={PADDING.left - 6}
          y={chart.scaleY(t) + 3}
          fill={theme.color.chartAxis}
          fontSize={10}
          textAnchor="end"
        >
          {yTickFormatter(t)}
        </SvgText>
      ))}

      {chart.xTicks.map((t, i) => (
        <SvgText
          key={`tx-${i}`}
          x={chart.scaleX(t)}
          y={height - PADDING.bottom + 14}
          fill={theme.color.chartAxis}
          fontSize={10}
          textAnchor="middle"
        >
          {xTickFormatter(t)}
        </SvgText>
      ))}

      <Path d={chart.path} stroke={theme.color.accent} strokeWidth={2} fill="none" />

      {chart.pointsAbs.map((p, i) => (
        <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill={theme.color.accent} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
  },
  emptyText: { color: theme.color.textTertiary, fontSize: theme.font.meta },
});
