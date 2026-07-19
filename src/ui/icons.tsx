/**
 * Icon registry — the app's entire icon language on one 24-grid.
 *
 * Stroke-only SVG with square caps and miter joins (industrial, not rounded).
 * Add glyphs here; never import per-glyph icon libraries or use emoji as UI.
 */
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

export type IconName =
  | 'clock'
  | 'trend'
  | 'user'
  | 'mic'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-right'
  | 'plus'
  | 'minus'
  | 'x'
  | 'skip'
  | 'flag';

export interface IconProps {
  name: IconName;
  /** Square bounding box in pt. */
  size?: number;
  color: string;
  /** Stroke width on the 24-grid. */
  stroke?: number;
}

export function Icon({ name, size = 22, color, stroke = 2 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth: stroke,
    fill: 'none' as const,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Polyline points="12,7.5 12,12.5 15.5,14.5" {...common} />
        </>
      )}
      {name === 'trend' && (
        <>
          <Polyline points="3.5,17 9.5,11 13.5,14.5 20.5,7" {...common} />
          <Polyline points="15.5,7 20.5,7 20.5,12" {...common} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={3.5} {...common} />
          <Path d="M5 19.5c0.6-4 3.4-5.5 7-5.5s6.4 1.5 7 5.5" {...common} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Path d="M9 7a3 3 0 0 1 6 0v4a3 3 0 0 1-6 0V7z" {...common} />
          <Path d="M6 11.5a6 6 0 0 0 12 0" {...common} />
          <Line x1={12} y1={17.5} x2={12} y2={20.5} {...common} />
        </>
      )}
      {name === 'check' && <Polyline points="5,12.5 10,17.5 19,6.5" {...common} />}
      {name === 'chevron-left' && <Polyline points="14.5,6 9,12 14.5,18" {...common} />}
      {name === 'chevron-right' && <Polyline points="9.5,6 15,12 9.5,18" {...common} />}
      {name === 'chevron-down' && <Polyline points="6,9.5 12,15 18,9.5" {...common} />}
      {name === 'arrow-right' && (
        <>
          <Line x1={4.5} y1={12} x2={19} y2={12} {...common} />
          <Polyline points="13.5,6.5 19,12 13.5,17.5" {...common} />
        </>
      )}
      {name === 'plus' && (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} {...common} />
          <Line x1={5} y1={12} x2={19} y2={12} {...common} />
        </>
      )}
      {name === 'minus' && (
        <Line x1={5} y1={12} x2={19} y2={12} {...common} />
      )}
      {name === 'x' && (
        <>
          <Line x1={6} y1={6} x2={18} y2={18} {...common} />
          <Line x1={18} y1={6} x2={6} y2={18} {...common} />
        </>
      )}
      {name === 'skip' && (
        <>
          <Path d="M6 5.5L14.5 12L6 18.5V5.5z" {...common} />
          <Line x1={17.5} y1={5.5} x2={17.5} y2={18.5} {...common} />
        </>
      )}
      {name === 'flag' && (
        <>
          <Line x1={6} y1={21} x2={6} y2={4} {...common} />
          <Path d="M6 5h11.5L15 8.5l2.5 3.5H6" {...common} />
        </>
      )}
    </Svg>
  );
}
