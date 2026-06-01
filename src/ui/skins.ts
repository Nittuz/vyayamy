/**
 * Skin registry — curated palettes layered on top of the brutalist-lifter base.
 *
 * Each skin is a coordinated { dark, light } pair sharing the same token *roles*;
 * only the values change. `src/ui/useTheme.ts` resolves the active skin (from
 * SkinContext) against the system color scheme to a single PaletteTokens object,
 * so no consumer signature changes.
 *
 * Forge is the original green palette (unchanged). Iron / Ember / Chalk are new.
 * `src/ui/__tests__/contrast.test.ts` validates every skin x scheme against WCAG AA.
 */
import { darkPalette, lightPalette, type PaletteTokens } from './colors';

export type SkinId = 'forge' | 'iron' | 'ember' | 'chalk';
export const SKIN_IDS: SkinId[] = ['forge', 'iron', 'ember', 'chalk'];

export const SKIN_META: Record<SkinId, { name: string; blurb: string }> = {
  forge: { name: 'Forge', blurb: 'Muted green — the original' },
  iron: { name: 'Iron', blurb: 'Cool steel & graphite' },
  ember: { name: 'Ember', blurb: 'Saffron heat' },
  chalk: { name: 'Chalk', blurb: 'Warm paper' },
};

/** Alpha wash derived from a hex accent/danger, keeping soft tokens consistent per skin. */
const soft = (hex: string, a: number): string => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

interface SkinSeed {
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
  danger: string;
  onAccent: string;
  overlay: string;
}

function make(p: SkinSeed): PaletteTokens {
  return {
    bg: p.bg,
    surface: p.surface,
    surface2: p.surface2,
    border: p.border,
    borderStrong: p.borderStrong,
    ink: p.ink,
    inkSecondary: p.inkSecondary,
    inkTertiary: p.inkTertiary,
    inkHero: p.inkHero,
    accent: p.accent,
    accentSoft: soft(p.accent, 0.12),
    success: p.accent,
    successSoft: soft(p.accent, 0.12),
    danger: p.danger,
    dangerSoft: soft(p.danger, 0.12),
    onAccent: p.onAccent,
    overlay: p.overlay,
  };
}

export const skins: Record<SkinId, { dark: PaletteTokens; light: PaletteTokens }> = {
  forge: { dark: darkPalette, light: lightPalette },
  iron: {
    dark: make({
      bg: '#0E1113',
      surface: '#15191C',
      surface2: '#1B2024',
      border: '#222A30',
      borderStrong: '#2C353C',
      ink: '#C7CDD2',
      inkSecondary: '#8A929B',
      inkTertiary: '#737C84',
      inkHero: '#EDEFF2',
      accent: '#8A93A0',
      danger: '#C76B58',
      onAccent: '#0E1113',
      overlay: 'rgba(0, 0, 0, 0.55)',
    }),
    light: make({
      bg: '#EEF0F2',
      surface: '#FFFFFF',
      surface2: '#F5F7F8',
      border: '#DDE1E5',
      borderStrong: '#C9CFD5',
      ink: '#1B1F22',
      inkSecondary: '#566069',
      inkTertiary: '#6B7178',
      inkHero: '#0A0D0F',
      accent: '#5C6573',
      danger: '#8A4030',
      onAccent: '#FFFFFF',
      overlay: 'rgba(30, 35, 40, 0.30)',
    }),
  },
  ember: {
    dark: make({
      bg: '#141110',
      surface: '#1C1815',
      surface2: '#241D18',
      border: '#2A211B',
      borderStrong: '#382C23',
      ink: '#D6C8BD',
      inkSecondary: '#A18E80',
      inkTertiary: '#897565',
      inkHero: '#F4E7DF',
      accent: '#E05A2C',
      danger: '#C24B45',
      onAccent: '#141110',
      overlay: 'rgba(0, 0, 0, 0.55)',
    }),
    light: make({
      bg: '#F6F1EC',
      surface: '#FFFFFF',
      surface2: '#FBF6F0',
      border: '#E7DDD1',
      borderStrong: '#D6C8B7',
      ink: '#231C17',
      inkSecondary: '#6B5C4F',
      inkTertiary: '#7C6C5D',
      inkHero: '#0D0907',
      accent: '#C24B22',
      danger: '#9A3328',
      onAccent: '#FFFFFF',
      overlay: 'rgba(40, 30, 20, 0.30)',
    }),
  },
  chalk: {
    dark: make({
      bg: '#16140F',
      surface: '#1D1A14',
      surface2: '#24201A',
      border: '#2A251D',
      borderStrong: '#383022',
      ink: '#D8D2C4',
      inkSecondary: '#A39C8B',
      inkTertiary: '#857C6B',
      inkHero: '#F0EBDF',
      accent: '#A99B6E',
      danger: '#B5644E',
      onAccent: '#16140F',
      overlay: 'rgba(0, 0, 0, 0.55)',
    }),
    light: make({
      bg: '#F4F1EB',
      surface: '#FFFFFF',
      surface2: '#FBF9F4',
      border: '#E5DFD3',
      borderStrong: '#D6CFC0',
      ink: '#1A1F1C',
      inkSecondary: '#5A625C',
      inkTertiary: '#6E746F',
      inkHero: '#0A0E0B',
      accent: '#4A4736',
      danger: '#8A4030',
      onAccent: '#FFFFFF',
      overlay: 'rgba(40, 30, 20, 0.30)',
    }),
  },
};
