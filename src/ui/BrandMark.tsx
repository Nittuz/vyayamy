/**
 * BrandMark — the FlexYug "loaded-bar" mark: the barbell side-on as slabs,
 * volt bar through bone plates. Drawn in react-native-svg on a 240 grid so it
 * holds from 24px to splash size. Theme-aware: ink reads chalk on blacktop,
 * near-black on chalk; the bar takes the scheme's accent (volt on dark,
 * pressed-volt on light). Geometry is mirrored by assets/branding/build-icons.js
 * (the store-asset generator) — keep the two in sync.
 */
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from './useTheme';

interface Props {
  size?: number;
  /** Override the plate color (defaults to the bone/iron ink). */
  ink?: string;
  /** Override the bar color (defaults to the volt accent). */
  accent?: string;
}

export function BrandMark({ size = 40, ink, accent }: Props) {
  const theme = useTheme();
  const plate = ink ?? theme.color.inkHero;
  const bar = accent ?? theme.color.accent;

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Rect x={16} y={104} width={208} height={32} fill={bar} />
      <Rect x={60} y={36} width={40} height={168} fill={plate} />
      <Rect x={140} y={36} width={40} height={168} fill={plate} />
      <Rect x={28} y={66} width={24} height={108} fill={plate} />
      <Rect x={188} y={66} width={24} height={108} fill={plate} />
    </Svg>
  );
}
