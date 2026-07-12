/**
 * Pure appearance resolver for the Segment primitive (no react-native runtime
 * import, so it is unit-testable — same precedent as plateStyles.ts).
 *
 * Blacktop selection semantics: inversion, never volt. The selected option is
 * an inverted Plate (chalk face + blacktop type in dark; black panel + chalk
 * type in light); unselected options are ghosts with a hairline rule ("
 * available"). `md` is the Profile-units look (card text, wide tracking);
 * `sm` is the compact chart-control look (meta text).
 */
import type { PlateBorder, PlateTone } from './plateStyles';
import type { TextVariant } from './textVariants';
import type { Theme } from './useTheme';

export type SegmentSize = 'sm' | 'md';

export interface SegmentAppearance {
  tone: Extract<PlateTone, 'inverted' | 'ghost'>;
  border: Extract<PlateBorder, 'soft' | 'none'>;
  textVariant: Extract<TextVariant, 'card' | 'meta'>;
  textColor: string;
  letterSpacing: number | null;
}

export function resolveSegmentAppearance(
  theme: Theme,
  { size, selected }: { size: SegmentSize; selected: boolean },
): SegmentAppearance {
  return {
    tone: selected ? 'inverted' : 'ghost',
    border: selected ? 'none' : 'soft',
    // Inverted face: type takes the scheme's ground color (blacktop on chalk
    // in dark, chalk on the black panel in light).
    textColor: selected ? theme.color.bg : theme.color.inkSecondary,
    textVariant: size === 'md' ? 'card' : 'meta',
    letterSpacing: size === 'md' ? 1 : null,
  };
}
