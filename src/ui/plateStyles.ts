/**
 * Pure style resolver for the Plate primitive (no react-native runtime import,
 * so it is unit-testable). Blacktop materiality: shadows are retired — a Plate
 * is a flat face whose tone decides fill, foreground ink, and default border.
 * Elevation is inversion (chalk face, blacktop ink), never depth.
 *
 * Tones (one semantic per treatment):
 *   panel    — default resting surface (surface fill + 1.5px `border` rule)
 *   inverted — THE elevation/emphasis state (ink fill, bg-colored type)
 *   ghost    — transparent, borderless ("available")
 *   volt     — accent fill ("act now / achievement"; primary CTA + PR only)
 *
 * Legacy Forged Iron tone values are mapped so pre-overhaul call sites keep
 * compiling with sensible appearance until the per-screen phase migrates them:
 * surface→panel, surface2→panel, bg→ghost, accent→volt.
 *
 * One destructive treatment (impeccable batch 5): every screen now speaks
 * danger the same quiet way — a `panel` Plate with a danger hairline and
 * danger text, no fill (QuarantineBanner, Today's sync row, every `Button
 * kind="danger"` via TONE_FOR_KIND's 'ghost' mapping). The filled `danger`
 * tone below has no remaining consumer; it is kept only so the PlateTone API
 * surface doesn't shrink out from under any direct `tone="danger"` caller —
 * retire it outright if that's ever confirmed dead for good.
 */
import type { ViewStyle } from 'react-native';

import type { Theme } from './useTheme';

/** Legacy prop — slab offsets are retired; accepted and ignored for compat. */
export type PlateOffset = 'md' | 'sm' | 'none';

export type PlateTone =
  // Blacktop tones
  | 'panel'
  | 'inverted'
  | 'ghost'
  | 'volt'
  // Legacy Forged Iron tones (mapped)
  | 'surface'
  | 'surface2'
  | 'accent'
  | 'danger'
  | 'bg';

export type PlateBorder = 'strong' | 'soft' | 'none';

export interface PlateStyleOptions {
  /** Ignored — the offset slab retired with the Blacktop overhaul. */
  offset?: PlateOffset;
  tone?: PlateTone;
  /** Omit to take the tone's default (panel: soft hairline; others: none). */
  border?: PlateBorder;
}

export interface PlateStyles {
  container: ViewStyle;
  /** Always null — the slab shadow retired; key kept for composed consumers. */
  slab: ViewStyle | null;
  face: ViewStyle;
  /** Recommended foreground color for text/icons sitting on this tone. */
  ink: string;
}

type CanonicalTone = 'panel' | 'inverted' | 'ghost' | 'volt' | 'danger';

export function canonicalTone(tone: PlateTone): CanonicalTone {
  switch (tone) {
    case 'panel':
    case 'surface':
    case 'surface2':
      return 'panel';
    case 'inverted':
      return 'inverted';
    case 'ghost':
    case 'bg':
      return 'ghost';
    case 'volt':
    case 'accent':
      return 'volt';
    case 'danger':
      return 'danger';
  }
}

function toneAppearance(
  theme: Theme,
  tone: CanonicalTone,
): { fill: string; ink: string; defaultBorder: PlateBorder } {
  switch (tone) {
    case 'panel':
      return { fill: theme.color.surface, ink: theme.color.ink, defaultBorder: 'soft' };
    case 'inverted':
      // Dark: chalk face, blacktop type. Light: black panel, chalk type.
      return { fill: theme.color.ink, ink: theme.color.bg, defaultBorder: 'none' };
    case 'ghost':
      return { fill: 'transparent', ink: theme.color.ink, defaultBorder: 'none' };
    case 'volt':
      return { fill: theme.color.accent, ink: theme.color.onAccent, defaultBorder: 'none' };
    case 'danger':
      return { fill: theme.color.danger, ink: theme.color.onAccent, defaultBorder: 'none' };
  }
}

function borderStyle(
  theme: Theme,
  border: PlateBorder,
): Pick<ViewStyle, 'borderWidth' | 'borderColor'> {
  switch (border) {
    case 'strong':
      return { borderWidth: theme.depth.hairline, borderColor: theme.color.borderStrong };
    case 'soft':
      return { borderWidth: theme.depth.hairline, borderColor: theme.color.border };
    case 'none':
      return { borderWidth: 0 };
  }
}

export function resolvePlateStyles(theme: Theme, options: PlateStyleOptions = {}): PlateStyles {
  const { tone = 'panel' } = options;
  const appearance = toneAppearance(theme, canonicalTone(tone));
  const border = options.border ?? appearance.defaultBorder;

  // Blacktop shape lock: faces are all-sharp — no borderRadius at all.
  const face: ViewStyle = {
    backgroundColor: appearance.fill,
    ...borderStyle(theme, border),
  };

  return { container: {}, slab: null, face, ink: appearance.ink };
}

/** Press feedback targets: a 60ms dip (see motion.duration.press). */
export const PRESS_DIP_OPACITY = 0.8;
export const PRESS_DIP_SCALE = 0.985;

/**
 * The pressed-state target style. Reduced motion drops the scale component —
 * the dip becomes opacity only (and Plate applies it instantly, no timing).
 */
export function resolvePressedStyle(reduceMotion: boolean): ViewStyle {
  return reduceMotion
    ? { opacity: PRESS_DIP_OPACITY }
    : { opacity: PRESS_DIP_OPACITY, transform: [{ scale: PRESS_DIP_SCALE }] };
}
