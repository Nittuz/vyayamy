/**
 * Pure appearance resolver for the Segment primitive (no react-native runtime
 * import, so it is unit-testable — same precedent as plateStyles.ts).
 *
 * A segment option is a flat Plate: ember (accent) fill when selected,
 * surface2 when not. `md` is the Profile-units look (card text, wide
 * tracking); `sm` is the compact chart-control look (meta text).
 */
import type { PlateTone } from './plateStyles';
import type { TextVariant } from './textVariants';
import type { Theme } from './useTheme';

export type SegmentSize = 'sm' | 'md';

export interface SegmentAppearance {
  tone: Extract<PlateTone, 'accent' | 'surface2'>;
  textVariant: Extract<TextVariant, 'card' | 'meta'>;
  textColor: string;
  letterSpacing: number | null;
}

export function resolveSegmentAppearance(
  theme: Theme,
  { size, selected }: { size: SegmentSize; selected: boolean },
): SegmentAppearance {
  return {
    tone: selected ? 'accent' : 'surface2',
    textVariant: size === 'md' ? 'card' : 'meta',
    textColor: selected ? theme.color.onAccent : theme.color.inkSecondary,
    letterSpacing: size === 'md' ? 1 : null,
  };
}
