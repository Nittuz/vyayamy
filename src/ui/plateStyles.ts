/**
 * Pure style resolver for the Plate primitive (no react-native runtime import,
 * so it is unit-testable). A Plate is the Forged Iron card: a face with a 2px
 * structural rule sitting on a hard offset slab.
 *
 * Technique (both platforms, no native shadow APIs): the container reserves
 * offset space on the right/bottom; an absolutely-positioned slab View fills
 * the offset rectangle behind the face. Native shadows are wrong here — they
 * translate WITH the pressed face, so the face could never sink into its slab.
 */
import type { ViewStyle } from 'react-native';

import type { Theme } from './useTheme';

export type PlateOffset = 'md' | 'sm' | 'none';
export type PlateTone = 'surface' | 'surface2' | 'accent' | 'danger' | 'bg';
export type PlateBorder = 'strong' | 'soft' | 'none';

export interface PlateStyleOptions {
  offset?: PlateOffset;
  tone?: PlateTone;
  border?: PlateBorder;
  radius?: keyof Theme['radius'];
}

export interface PlateStyles {
  container: ViewStyle;
  slab: ViewStyle | null;
  face: ViewStyle;
  /** Merged over `face` while pressed — the face sinks toward its slab. */
  facePressed: ViewStyle;
}

export function plateOffsetPx(theme: Theme, offset: PlateOffset): number {
  switch (offset) {
    case 'md':
      return theme.depth.slab;
    case 'sm':
      return theme.depth.slabSm;
    case 'none':
      return 0;
  }
}

function toneColor(theme: Theme, tone: PlateTone): string {
  switch (tone) {
    case 'surface':
      return theme.color.surface;
    case 'surface2':
      return theme.color.surface2;
    case 'accent':
      return theme.color.accent;
    case 'danger':
      return theme.color.danger;
    case 'bg':
      return theme.color.bg;
  }
}

function borderStyle(theme: Theme, border: PlateBorder): Pick<ViewStyle, 'borderWidth' | 'borderColor'> {
  switch (border) {
    case 'strong':
      return { borderWidth: theme.depth.rule, borderColor: theme.color.borderStrong };
    case 'soft':
      return { borderWidth: theme.depth.rule, borderColor: theme.color.border };
    case 'none':
      return { borderWidth: 0 };
  }
}

export function resolvePlateStyles(theme: Theme, options: PlateStyleOptions = {}): PlateStyles {
  const { offset = 'md', tone = 'surface', border = 'strong', radius = 'card' } = options;
  const offsetPx = plateOffsetPx(theme, offset);
  const borderRadius = theme.radius[radius];

  const container: ViewStyle =
    offsetPx > 0 ? { paddingRight: offsetPx, paddingBottom: offsetPx } : {};

  const slab: ViewStyle | null =
    offsetPx > 0
      ? {
          position: 'absolute',
          top: offsetPx,
          left: offsetPx,
          right: 0,
          bottom: 0,
          backgroundColor: theme.color.slab,
          borderRadius,
        }
      : null;

  const face: ViewStyle = {
    backgroundColor: toneColor(theme, tone),
    borderRadius,
    ...borderStyle(theme, border),
  };

  // The sink is capped by the slab depth: a flat Plate doesn't move when pressed.
  const sink = Math.min(theme.press.translate, offsetPx);
  const facePressed: ViewStyle =
    sink > 0 ? { transform: [{ translateX: sink }, { translateY: sink }] } : {};

  return { container, slab, face, facePressed };
}
