import { useColorScheme } from 'react-native';

import { type PaletteTokens } from './colors';
import { motion } from './motion';
import { skins, type SkinId } from './skins';
import { useSkin } from './SkinContext';
import { typography } from './typography';

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
  card: 14,
  button: 8,
} as const;

export const touch = {
  min: 44,
  navHeight: 64,
  cta: 52,
  avatar: 56,
  avatarRadius: 28,
} as const;

export interface Theme {
  color: PaletteTokens;
  space: typeof space;
  radius: typeof radius;
  touch: typeof touch;
  font: typeof typography;
  motion: typeof motion;
  scheme: 'light' | 'dark';
}

// Cache one Theme per (skin, scheme). Because the palette + token objects are
// all module-level constants, the cached Theme is referentially stable for the
// life of the process — so useTheme returns the SAME object every render unless
// the skin or scheme actually changes, and the nine useMemo(makeStyles,[theme])
// sites finally cache instead of rebuilding StyleSheets every render (#48).
const themeCache = new Map<string, Theme>();

export function buildTheme(skin: SkinId, scheme: 'light' | 'dark'): Theme {
  const key = `${skin}:${scheme}`;
  let theme = themeCache.get(key);
  if (!theme) {
    const color: PaletteTokens = skins[skin][scheme];
    theme = { color, space, radius, touch, font: typography, motion, scheme };
    themeCache.set(key, theme);
  }
  return theme;
}

export function useTheme(): Theme {
  const raw = useColorScheme();
  const scheme: 'light' | 'dark' = raw === 'light' ? 'light' : 'dark';
  const { skin } = useSkin();
  return buildTheme(skin, scheme);
}
