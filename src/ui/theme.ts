/**
 * Compatibility shim — Phase 1 of the brutalist-lifter uplevel.
 *
 * The new design system lives in:
 *   - src/ui/colors.ts       (light + dark palettes)
 *   - src/ui/typography.ts   (font tokens)
 *   - src/ui/motion.ts       (spring + duration)
 *   - src/ui/haptics.ts      (haptic wrappers)
 *   - src/ui/useTheme.ts     (hook for dynamic theming)
 *
 * This file remains as a STATIC export for non-Phase-1 screens that
 * still reference `theme.color.X` inside StyleSheet.create. It is
 * pinned to the DARK palette. Phase 3 (Restraint) migrates remaining
 * screens to useTheme() and this file is then deleted.
 *
 * Legacy color names (brand, pr, accentMuted, textSecondary, etc.)
 * are mapped to the closest new token so existing screens don't break.
 */
import { darkPalette } from './colors';
import { motion } from './motion';
import { space, radius, touch } from './useTheme';
import { typography } from './typography';

const legacyColors = {
  // New canonical names (so new code can also import from theme.color)
  bg: darkPalette.bg,
  surface: darkPalette.surface,
  surface2: darkPalette.surface2,
  border: darkPalette.border,
  borderStrong: darkPalette.borderStrong,
  ink: darkPalette.ink,
  inkSecondary: darkPalette.inkSecondary,
  inkTertiary: darkPalette.inkTertiary,
  inkHero: darkPalette.inkHero,
  accent: darkPalette.accent,
  accentSoft: darkPalette.accentSoft,
  success: darkPalette.success,
  successSoft: darkPalette.successSoft,
  danger: darkPalette.danger,
  dangerSoft: darkPalette.dangerSoft,
  onAccent: darkPalette.onAccent,
  overlay: darkPalette.overlay,

  // Legacy aliases (consumed by non-Phase-1 screens; resolve to closest new token)
  text: darkPalette.ink,
  textSecondary: darkPalette.inkSecondary,
  textTertiary: darkPalette.inkTertiary,
  textMuted: darkPalette.inkSecondary,
  accentMuted: darkPalette.inkSecondary,
  brand: darkPalette.accent,
  brandMuted: darkPalette.accent,
  brandSoft: darkPalette.accentSoft,
  onBrand: darkPalette.onAccent,
  pr: darkPalette.accent,
  prSoft: darkPalette.accentSoft,
  chartAxis: darkPalette.inkTertiary,
};

const legacyFont = {
  display: typography.size.display,
  title: typography.size.title,
  section: typography.size.title,
  card: typography.size.card,
  body: typography.size.body,
  meta: typography.size.meta,
  micro: typography.size.micro,
  weight: {
    medium: typography.weight.medium,
    semibold: typography.weight.semibold,
    bold: typography.weight.semibold,
  },
};

const legacyDuration = {
  fast: motion.duration.fast,
  normal: motion.duration.base,
  slow: motion.duration.slow,
};

export const theme = {
  color: legacyColors,
  space,
  radius,
  font: legacyFont,
  touch,
  duration: legacyDuration,
};

export type Theme = typeof theme;

// ---------------------------------------------------------------------------
// Legacy named exports consumed by Logo.tsx, Login.tsx, etc.
// These were top-level exports on the old theme.ts; re-exported here so
// consumers don't need to change their imports.
// ---------------------------------------------------------------------------

/** Brand identity — saffron stays on the logo mark only. */
export const brand = {
  name: 'FlexYug',
  tagline: 'The Strength Era',
  saffron: '#E05A2C',
  saffronDark: '#C24B22',
  saffronLight: '#F0A060',
  stone: '#1C1917',
  cream: '#F8F6F3',
} as const;

/** Legacy `colors` object (same as theme.color). Kept for Logo.tsx. */
export const colors = legacyColors;

/** Legacy top-level `font` object (same as theme.font). Kept for Logo.tsx. */
export const font = legacyFont;
