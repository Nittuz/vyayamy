/**
 * Forged Iron color tokens.
 * Two coordinated palettes — iron dark (default-feeling) and bone-paper light.
 * One hot ember accent per scheme; everything else is neutral iron and bone.
 * Consumed via `src/ui/useTheme.ts` which selects based on system color scheme.
 *
 * Accent is tuned per scheme for WCAG: #E8602F clears 4.5 on the dark surfaces,
 * but raw ember fails on bone, so light uses the deeper #B83E14.
 * `src/ui/__tests__/contrast.test.ts` is the merge gate for any change here.
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
  /** The hard offset slab behind Plate faces — the palette's deepest value. */
  slab: string;
}

export const darkPalette: PaletteTokens = {
  bg: '#0B0B0D',
  surface: '#131316',
  surface2: '#1B1B1F',
  border: '#26262B',
  borderStrong: '#404048',
  ink: '#E8E5DE',
  inkSecondary: '#A6A39B',
  inkTertiary: '#74716A',
  inkHero: '#F4F1E9',
  accent: '#E8602F',
  accentSoft: 'rgba(232, 96, 47, 0.14)',
  success: '#E8602F',
  successSoft: 'rgba(232, 96, 47, 0.14)',
  danger: '#D6524A',
  dangerSoft: 'rgba(214, 82, 74, 0.14)',
  onAccent: '#0B0B0D',
  overlay: 'rgba(0, 0, 0, 0.6)',
  slab: '#000000',
};

export const lightPalette: PaletteTokens = {
  bg: '#ECEAE4',
  surface: '#F7F5F0',
  surface2: '#E0DED7',
  border: '#C8C6BE',
  borderStrong: '#17171A',
  ink: '#1A1A1D',
  inkSecondary: '#53524D',
  inkTertiary: '#71706A',
  inkHero: '#0C0C0E',
  accent: '#B83E14',
  accentSoft: 'rgba(184, 62, 20, 0.10)',
  success: '#B83E14',
  successSoft: 'rgba(184, 62, 20, 0.10)',
  danger: '#A8312B',
  dangerSoft: 'rgba(168, 49, 43, 0.10)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(12, 12, 14, 0.4)',
  slab: '#17171A',
};
