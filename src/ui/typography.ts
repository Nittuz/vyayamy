/**
 * Brutalist-lifter typography tokens.
 *
 * Family: Geist Sans for chrome/labels, Geist Mono for numerals + data.
 * Sizes are React Native `fontSize` (sp on Android, pt on iOS).
 * Tracking is in pt for `letterSpacing`.
 * Line-heights are multipliers (multiply by fontSize for RN `lineHeight`).
 */

export const fontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const fontSize = {
  hero: 82,
  display: 28,
  title: 20,
  card: 16,
  body: 14,
  meta: 12,
  micro: 10,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

export const tracking = {
  hero: -3.5,
  display: -0.5,
  title: -0.3,
  body: 0,
  micro: 1.5,
} as const;

export const lineHeightMul = {
  hero: 0.92,
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
