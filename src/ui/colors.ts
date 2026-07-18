/**
 * Blacktop color tokens (Direction C overhaul, 2026-07-11 spec).
 * Two coordinated palettes — blacktop dark (default) and chalk light.
 * True mono plus one volt signal; inversion is elevation, so everything else
 * is neutral blacktop and chalk. Consumed via `src/ui/useTheme.ts`.
 *
 * Volt only ever sits on blacktop: raw volt fails as text on chalk, so the
 * light accent is pressed-volt #55650B (same dark-olive-volt family), and volt
 * appears in light mode only inside inverted black panels.
 *
 * Tuned off-spec for WCAG (see src/ui/__tests__/contrast.test.ts, the merge
 * gate for any change here):
 *   - dark inkTertiary #6E6E66 (spec #66665F was 2.72:1 on surface2, needs 3.0)
 *   - light danger #AC3D2D (spec #B3402F was 4.42:1 on surface2, needs 4.5)
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
  bg: '#121212',
  surface: '#1A1A19',
  surface2: '#232322',
  border: '#333331',
  borderStrong: '#55554F',
  ink: '#F2F1ED',
  inkSecondary: '#A8A8A1',
  inkTertiary: '#6E6E66',
  inkHero: '#FAF9F4',
  accent: '#D8FF3E',
  accentSoft: 'rgba(216, 255, 62, 0.12)',
  // success = accent: one volt signal, achievement and action share it.
  success: '#D8FF3E',
  successSoft: 'rgba(216, 255, 62, 0.12)',
  danger: '#FF6A55',
  dangerSoft: 'rgba(255, 106, 85, 0.12)',
  onAccent: '#121212',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

export const lightPalette: PaletteTokens = {
  bg: '#EFEEE9',
  surface: '#F7F6F1',
  surface2: '#E4E3DC',
  border: '#CFCEC6',
  borderStrong: '#141414',
  ink: '#141414',
  inkSecondary: '#4F4F4A',
  inkTertiary: '#6E6E66',
  inkHero: '#0C0C0C',
  accent: '#55650B',
  accentSoft: 'rgba(85, 101, 11, 0.12)',
  success: '#55650B',
  successSoft: 'rgba(85, 101, 11, 0.12)',
  danger: '#AC3D2D',
  dangerSoft: 'rgba(172, 61, 45, 0.10)',
  onAccent: '#F2F1ED',
  overlay: 'rgba(20, 20, 20, 0.45)',
};
