/**
 * Brutalist-lifter color tokens.
 * Two coordinated palettes — dark (default-feeling) and light (warm-paper inverse).
 * Consumed via `src/ui/useTheme.ts` which selects based on system color scheme.
 *
 * Phase 1 introduces these; src/ui/theme.ts shims old token names onto them.
 */

export interface PaletteTokens {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  inkHero: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  onAccent: string;
  overlay: string;
}

export const darkPalette: PaletteTokens = {
  bg: '#0F1411',
  surface: '#161B18',
  surface2: '#1A211C',
  border: '#1A2420',
  borderStrong: '#1F2925',
  ink: '#C9D4CC',
  inkSecondary: '#8C9A92',
  inkTertiary: '#5E6862',
  inkHero: '#E8F0EA',
  accent: '#6DA37E',
  accentSoft: 'rgba(109, 163, 126, 0.12)',
  success: '#6DA37E',
  successSoft: 'rgba(109, 163, 126, 0.12)',
  danger: '#C76B58',
  dangerSoft: 'rgba(199, 107, 88, 0.12)',
  onAccent: '#0F1411',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const lightPalette: PaletteTokens = {
  bg: '#F4F1EB',
  surface: '#FFFFFF',
  surface2: '#F1F4F0',
  border: '#E5DFD3',
  borderStrong: '#D6CFC0',
  ink: '#1A1F1C',
  inkSecondary: '#5A625C',
  inkTertiary: '#7E847F',
  inkHero: '#0A0E0B',
  accent: '#3D6E52',
  accentSoft: 'rgba(61, 110, 82, 0.10)',
  success: '#3D6E52',
  successSoft: 'rgba(61, 110, 82, 0.10)',
  danger: '#8A4030',
  dangerSoft: 'rgba(138, 64, 48, 0.10)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(40, 30, 20, 0.30)',
};
