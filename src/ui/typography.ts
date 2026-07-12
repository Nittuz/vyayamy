/**
 * Forged Iron typography tokens.
 *
 * Families: Anton (condensed industrial display) for screen-defining headlines,
 * Geist Sans for chrome/labels/body, Geist Mono for numerals + data.
 * Sizes are React Native `fontSize` (sp on Android, pt on iOS).
 * Tracking is in pt for `letterSpacing`.
 * Line-heights are multipliers (multiply by fontSize for RN `lineHeight`).
 *
 * Display variants are uppercase Anton and reserved for app chrome — user
 * content (workout titles, exercise names) stays on title/card so it is never
 * force-uppercased into a poster face.
 */

export const fontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  condensed: 'Anton_400Regular',
} as const;

export const fontSize = {
  displayXXL: 96,
  hero: 82,
  displayXL: 44,
  display: 34,
  title: 20,
  card: 16,
  body: 14,
  meta: 12,
  micro: 12,
  numeralLg: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

export const tracking = {
  hero: -3.5,
  // At poster scale Anton tightens instead: the XXL headline is a single
  // welded slab on purpose.
  displayXXL: -1,
  // Anton is tight by design; a touch of positive tracking keeps uppercase
  // headlines from welding into a single slab.
  condensed: 0.5,
  display: -0.5,
  title: -0.3,
  body: 0,
  numeralLg: -1,
  micro: 2,
  // Mono metadata strips: a touch of tracking keeps uppercased GeistMono
  // runs legible at 12pt without drifting into eyebrow territory.
  strip: 0.5,
} as const;

export const lineHeightMul = {
  // Must stay >= 1.0: a sub-1 line height shrinks the line box below the font
  // size and iOS clips the tops of tall glyphs — the 82pt mono hero numerals
  // and equally the condensed Anton display caps. Horizontal tightness comes
  // from tracking, never from the line box.
  hero: 1.2,
  // 1.05 clipped Anton's ascender overshoot at displayXL on device (verified
  // on simulator: PROGRESS glyph tops sliced flat). 1.1 clears both sizes.
  displayXXL: 1.1,
  displayXL: 1.1,
  display: 1.1,
  title: 1.2,
  body: 1.4,
  meta: 1.6,
} as const;

export const typography = {
  family: fontFamily,
  size: fontSize,
  weight: fontWeight,
  tracking,
  lineHeightMul,
};

export type Typography = typeof typography;
