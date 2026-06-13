/**
 * BrandMark — the FlexYug "loaded-end" mark: a barbell plate seen end-on, with a
 * milled tick ring and a hot ember bore. Drawn in react-native-svg on a 240 grid
 * so it holds from 24px to splash size. Theme-aware: the iron rim reads bone on
 * dark, near-black on light; the bore is always ember.
 */
import { useMemo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

import { useTheme } from './useTheme';

const TICKS = 24;
const RING_INNER = 62;
const RING_OUTER = 78;

// Precompute the milled-edge tick endpoints once (240-space).
const tickLines = Array.from({ length: TICKS }, (_, i) => {
  const a = (i * Math.PI * 2) / TICKS;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x1: 120 + cos * RING_INNER,
    y1: 120 + sin * RING_INNER,
    x2: 120 + cos * RING_OUTER,
    y2: 120 + sin * RING_OUTER,
  };
});

interface Props {
  size?: number;
  /** Override the rim/tick color (defaults to the bone/iron ink). */
  ink?: string;
  /** Override the bore color (defaults to the ember accent). */
  accent?: string;
}

export function BrandMark({ size = 40, ink, accent }: Props) {
  const theme = useTheme();
  const rim = ink ?? theme.color.inkHero;
  const bore = accent ?? theme.color.accent;

  const ticks = useMemo(
    () =>
      tickLines.map((t, i) => (
        <Line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={rim}
          strokeWidth={7}
          strokeLinecap="butt"
        />
      )),
    [rim],
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Circle cx={120} cy={120} r={92} fill="none" stroke={rim} strokeWidth={14} />
      {ticks}
      <Circle cx={120} cy={120} r={30} fill={bore} />
    </Svg>
  );
}
