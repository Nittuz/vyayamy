/**
 * Pure style resolver for the Plate primitive (no react-native runtime import,
 * so it is unit-testable). Softened Blacktop: a Plate is a flat, lightly
 * rounded face whose tone decides fill, foreground ink, and default border,
 * and whose shape decides the radius.
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

/** Corner treatment (Softened Blacktop). `none` is for faces inside a rule-separated list. */
export type PlateShape = 'card' | 'control' | 'none';

/**
 * Press response. `scale` (cards, filled buttons): a 0.975 scale plus a mild
 * darken. `highlight` (list rows, outlined/ghost buttons): a fill tint, no
 * movement — the iOS list-row feel. Reduced Motion drops the scale.
 */
export type PlatePress = 'scale' | 'highlight';

export interface PlateStyleOptions {
  /** Ignored — the offset slab retired with the Blacktop overhaul. */
  offset?: PlateOffset;
  tone?: PlateTone;
  /** Omit to take the tone's default (panel: soft hairline; others: none). */
  border?: PlateBorder;
  /** Omit for `card`. */
  shape?: PlateShape;
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
  const { tone = 'panel', shape = 'card' } = options;
  const appearance = toneAppearance(theme, canonicalTone(tone));
  const border = options.border ?? appearance.defaultBorder;

  const face: ViewStyle = {
    backgroundColor: appearance.fill,
    ...borderStyle(theme, border),
    ...(shape === 'none' ? {} : { borderRadius: theme.radius[shape] }),
  };

  return { container: {}, slab: null, face, ink: appearance.ink };
}

/**
 * Honest disabled face for FILLED tones (Button's primary/inverted kinds) —
 * replaces Plate's generic 0.5-opacity dim, which smears a filled face's
 * text down to the same translucency as its background and reads as a
 * rendering glitch rather than a state (owner review finding, dark Login
 * CTA). A flat surface2 fill, hairline border, inkTertiary ink: real colors,
 * no opacity on anything. Ghost/secondary kinds keep the generic Plate dim —
 * it still reads as intentional there, since it's only muting an
 * already-quiet tone.
 */
export function resolveDisabledFaceStyles(theme: Theme): { face: ViewStyle; ink: string } {
  return {
    face: { backgroundColor: theme.color.surface2, ...borderStyle(theme, 'soft') },
    ink: theme.color.inkTertiary,
  };
}

/**
 * Press feedback targets (Softened Blacktop, spec 2026-09-23).
 * `scale`: cards and filled buttons shrink to 0.975 and darken to 0.92 over
 * motion.duration.press. `highlight`: rows and outlined/ghost buttons tint
 * their fill by 8% of the foreground ink, no movement. PRESS_DIP_OPACITY is
 * the legacy dip still used by flat, non-Plate pressables (keypad keys).
 */
export const PRESS_SCALE = 0.975;
export const PRESS_SCALE_OPACITY = 0.92;
export const PRESS_HIGHLIGHT_OPACITY = 0.08;
export const PRESS_DIP_OPACITY = 0.8;

/**
 * The pressed-state target for the FACE. Highlight returns nothing here: its
 * response is the tint layer Plate renders over the face. Reduced motion
 * drops the scale component of `scale` (Plate applies it instantly).
 */
export function resolvePressedStyle(reduceMotion: boolean, press: PlatePress = 'scale'): ViewStyle {
  if (press === 'highlight') return {};
  return reduceMotion
    ? { opacity: PRESS_SCALE_OPACITY }
    : { opacity: PRESS_SCALE_OPACITY, transform: [{ scale: PRESS_SCALE }] };
}
