/**
 * Design tokens ported from legacy-web/src/styles/theme.css.
 * Kept as a plain TS object so it can be consumed by StyleSheet.create
 * and by computed style helpers.
 *
 * Single theme for now — dark mode variants live in `darkColors` below
 * and can be toggled in a later polish pass via useColorScheme().
 */

export const colors = {
  bg: '#F8F8F6',
  surface: '#FFFFFF',
  text: '#1C1917',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  textMuted: '#78716C',
  border: '#F0EEEC',
  borderStrong: '#E7E5E4',
  accent: '#1C1917',
  accentMuted: '#57534E',
  accentSoft: 'rgba(28, 25, 23, 0.06)',
  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.08)',
  danger: '#DC2626',
  pr: '#D97706',
  prSoft: 'rgba(217, 119, 6, 0.08)',
  chartAxis: '#A8A29E',
  onAccent: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.3)',
};

export const darkColors = {
  bg: '#1C1917',
  surface: '#292524',
  text: '#F5F5F4',
  textSecondary: '#A8A29E',
  textTertiary: '#78716C',
  textMuted: '#A8A29E',
  border: '#44403C',
  borderStrong: '#57534E',
  accent: '#F5F5F4',
  accentMuted: '#A8A29E',
  accentSoft: 'rgba(245, 245, 244, 0.08)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.12)',
  danger: '#EF4444',
  pr: '#FBBF24',
  prSoft: 'rgba(251, 191, 36, 0.12)',
  chartAxis: '#78716C',
  onAccent: '#1C1917',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export const space = {
  half: 2,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  section: 32,
  page: 20,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
  card: 12,
  button: 8,
} as const;

export const font = {
  display: 34,
  title: 28,
  section: 20,
  card: 16,
  body: 15,
  meta: 13,
  micro: 11,
  weight: {
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const touch = {
  min: 44,
  navHeight: 64,
} as const;

export const duration = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

export const theme = {
  color: colors,
  space,
  radius,
  font,
  touch,
  duration,
};

export type Theme = typeof theme;
