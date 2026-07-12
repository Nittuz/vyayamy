import { useColorScheme } from 'react-native';

import { type PaletteTokens } from './colors';
import { motion } from './motion';
import { DEFAULT_SKIN, skins, type SkinId } from './skins';
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

// Blacktop shape lock: all-sharp. Token names survive so consumers don't
// change, but every corner collapses to 0; `full` remains for the avatar only.
export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  full: 9999,
  card: 0,
  button: 0,
} as const;

/**
 * Rule weights. Blacktop retires the slab z-axis (shadows are gone; elevation
 * is inversion) — slab/slabSm survive only so legacy consumers keep compiling.
 * `hairline` is the Plate border weight: 1.5px structural rule.
 */
export const depth = {
  slab: 4,
  slabSm: 2,
  hairline: 1.5,
  rule: 2,
  ruleHeavy: 3,
} as const;

/** Legacy press-sink distance — retired (press is now a 60ms opacity/scale dip). */
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
  return buildTheme(DEFAULT_SKIN, scheme);
}
