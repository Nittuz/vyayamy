/**
 * BrandMark — the FlexYug mark, drawn in react-native-svg on a 240 grid so it
 * holds from 24px to splash size. Theme-aware: ink reads chalk on blacktop,
 * near-black on chalk; the accent element takes the scheme's accent (volt on
 * dark, pressed-volt on light).
 *
 * `variant` carries the July 2026 uplevel candidates (geometry mirrored from
 * assets/branding/uplevel.js). 'loaded-bar' won the uplevel round (2026-07-13)
 * and is the shipped default; the others are kept for reference.
 */
import { useMemo } from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { useTheme } from './useTheme';

export type BrandMarkVariant = 'loaded-end' | 'milled-plate' | 'stamp' | 'loaded-bar' | 'tally';

// Precompute milled-edge tick endpoints once per ring spec (240-space).
const ring = (count: number, inner: number, outer: number, phase = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * Math.PI * 2) / count + phase;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x1: 120 + cos * inner,
      y1: 120 + sin * inner,
      x2: 120 + cos * outer,
      y2: 120 + sin * outer,
    };
  });

const LOADED_END_TICKS = ring(24, 62, 78);
const MILLED_TICKS = ring(12, 52, 72, -Math.PI / 2);

interface Props {
  size?: number;
  /** Which mark to draw; defaults to the shipped loaded-bar. */
  variant?: BrandMarkVariant;
  /** Override the rim/tick/plate color (defaults to the bone/iron ink). */
  ink?: string;
  /** Override the accent element color (defaults to the volt accent). */
  accent?: string;
}

export function BrandMark({ size = 40, variant = 'loaded-bar', ink, accent }: Props) {
  const theme = useTheme();
  const rim = ink ?? theme.color.inkHero;
  const bore = accent ?? theme.color.accent;
  const punch = theme.color.bg;

  const body = useMemo(() => {
    switch (variant) {
      case 'milled-plate':
        // Loaded-end forged heavier: fat rim, 12 square-cut ticks, square volt bore.
        return (
          <>
            <Circle cx={120} cy={120} r={96} fill="none" stroke={rim} strokeWidth={18} />
            {MILLED_TICKS.map((t, i) => (
              <Line key={i} {...t} stroke={rim} strokeWidth={14} strokeLinecap="butt" />
            ))}
            <Rect x={88} y={88} width={64} height={64} fill={bore} />
          </>
        );
      case 'stamp':
        // Stencil F punched through a bone plate over a volt slab.
        return (
          <>
            <Rect x={46} y={46} width={176} height={176} fill={bore} />
            <Rect x={18} y={18} width={176} height={176} fill={rim} />
            <Rect x={52} y={36} width={44} height={140} fill={punch} />
            <Rect x={106} y={36} width={62} height={32} fill={punch} />
            <Rect x={106} y={94} width={50} height={28} fill={punch} />
          </>
        );
      case 'loaded-bar':
        // Side-view barbell as slabs: volt bar under bone plates.
        return (
          <>
            <Rect x={16} y={104} width={208} height={32} fill={bore} />
            <Rect x={60} y={36} width={40} height={168} fill={rim} />
            <Rect x={140} y={36} width={40} height={168} fill={rim} />
            <Rect x={28} y={66} width={24} height={108} fill={rim} />
            <Rect x={188} y={66} width={24} height={108} fill={rim} />
          </>
        );
      case 'tally':
        // Four strokes and the volt strike: a closed set of five.
        return (
          <>
            {[40, 88, 136, 184].map((x) => (
              <Rect key={x} x={x} y={40} width={24} height={160} fill={rim} />
            ))}
            <Rect
              x={10}
              y={106}
              width={220}
              height={28}
              fill={bore}
              transform="rotate(-20 120 120)"
            />
          </>
        );
      case 'loaded-end':
      default:
        return (
          <>
            <Circle cx={120} cy={120} r={92} fill="none" stroke={rim} strokeWidth={14} />
            {LOADED_END_TICKS.map((t, i) => (
              <Line key={i} {...t} stroke={rim} strokeWidth={7} strokeLinecap="butt" />
            ))}
            <Circle cx={120} cy={120} r={30} fill={bore} />
          </>
        );
    }
  }, [variant, rim, bore, punch]);

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      {body}
    </Svg>
  );
}
