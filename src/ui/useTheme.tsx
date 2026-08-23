import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type PaletteTokens } from './colors';
import { motion } from './motion';
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

// Blacktop shape lock: all-sharp — no corner radii anywhere. `full` survives
// for the one circular case (avatar / round indicators).
const radius = {
  full: 9999,
} as const;

/**
 * Rule weights. Elevation is inversion (no shadows, no slab z-axis);
 * `hairline` is the Plate border weight: 1.5px structural rule.
 */
const depth = {
  hairline: 1.5,
  rule: 2,
  ruleHeavy: 3,
} as const;

const touch = {
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
  touch: typeof touch;
  font: typeof typography;
  motion: typeof motion;
  scheme: 'light' | 'dark';
}

// Cache one Theme per scheme. Because the palette + token objects are all
// module-level constants, the cached Theme is referentially stable for the
// life of the process — so useTheme returns the SAME object every render unless
// the scheme actually changes, and the nine useMemo(makeStyles,[theme]) sites
// finally cache instead of rebuilding StyleSheets every render (#48).
const themeCache = new Map<string, Theme>();

export function buildTheme(scheme: 'light' | 'dark'): Theme {
  let theme = themeCache.get(scheme);
  if (!theme) {
    const color: PaletteTokens = scheme === 'light' ? lightPalette : darkPalette;
    theme = { color, space, radius, depth, touch, font: typography, motion, scheme };
    themeCache.set(scheme, theme);
  }
  return theme;
}

// Scoped scheme override — `null` (the default, no Provider mounted) means
// "no override": useTheme falls back to the system color scheme exactly as
// before. Every existing useTheme() call site is unaffected unless it renders
// under a <ThemeScope> ancestor, so this is additive: it can't disturb any
// caller that doesn't opt in.
const ThemeSchemeContext = createContext<'light' | 'dark' | null>(null);

/**
 * Pins every useTheme() call under this subtree to `scheme`, regardless of
 * the system setting. For brand chrome that must render as a fixed skin
 * rather than adapt to content preference — e.g. Login's dark poster — not a
 * general per-screen dark-mode toggle. Unmounting (navigating away) reverts
 * every descendant to the normal system-driven scheme with no extra cleanup.
 */
export function ThemeScope({
  scheme,
  children,
}: {
  scheme: 'light' | 'dark';
  children: ReactNode;
}) {
  return <ThemeSchemeContext.Provider value={scheme}>{children}</ThemeSchemeContext.Provider>;
}

export function useTheme(): Theme {
  const raw = useColorScheme();
  const override = useContext(ThemeSchemeContext);
  const scheme: 'light' | 'dark' = override ?? (raw === 'light' ? 'light' : 'dark');
  return buildTheme(scheme);
}
