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

// Forged Iron corners are near-sharp: the slab + 2px rule carry the form,
// not rounding. Token names survive so consumers don't change.
export const radius = {
  sm: 2,
  md: 4,
  lg: 6,
  full: 9999,
  card: 4,
  button: 2,
} as const;

/** Hard-offset slab depths and rule weights — the Forged Iron z-axis. */
export const depth = {
  slab: 4,
  slabSm: 2,
  rule: 2,
  ruleHeavy: 3,
} as const;

/** Pressed faces translate this far toward their slab (direct manipulation, not animation). */
export const press = {
  translate: 3,
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
  depth: typeof depth;
  press: typeof press;
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
    theme = { color, space, radius, depth, press, touch, font: typography, motion, scheme };
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
