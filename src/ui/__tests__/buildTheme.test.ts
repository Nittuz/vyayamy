/**
 * Regression guard for deep-review #48:
 *   "useTheme returns a new object identity every render, silently defeating all
 *    nine useMemo(makeStyles, [theme]) sites."
 *
 * buildTheme caches by scheme, so every consumer gets the SAME theme object for
 * a given scheme — makeStyles memos then actually cache.
 */
import { darkPalette, lightPalette, type PaletteTokens } from '@/ui/colors';
import { buildTheme } from '@/ui/useTheme';

test('returns a STABLE reference for the same scheme (#48)', () => {
  expect(buildTheme('dark')).toBe(buildTheme('dark'));
  expect(buildTheme('light')).toBe(buildTheme('light'));
});

test('returns distinct objects for different schemes', () => {
  expect(buildTheme('dark')).not.toBe(buildTheme('light'));
});

test('carries the right palette, scheme, and depth tokens', () => {
  const t = buildTheme('light');
  expect(t.scheme).toBe('light');
  expect(t.color).toBe(lightPalette);
  expect(buildTheme('dark').color).toBe(darkPalette);
  // Blacktop rule weights ride on the theme (elevation is inversion — no
  // slab/press tokens; those retired with the design-pivot cleanup).
  expect(t.depth.hairline).toBe(1.5);
  expect(t.depth.rule).toBeGreaterThanOrEqual(2);
  expect(t.depth.ruleHeavy).toBeGreaterThan(t.depth.rule);
});

// Folded in from the retired skin-registry test: both palettes carry the full
// token shape (a missing token surfaces as `undefined` colors at runtime).
const TOKEN_KEYS: (keyof PaletteTokens)[] = [
  'bg',
  'surface',
  'surface2',
  'border',
  'borderStrong',
  'ink',
  'inkSecondary',
  'inkTertiary',
  'inkHero',
  'accent',
  'accentSoft',
  'success',
  'successSoft',
  'danger',
  'dangerSoft',
  'onAccent',
  'overlay',
];

test('both palettes expose the full token shape', () => {
  for (const tokens of [darkPalette, lightPalette]) {
    for (const k of TOKEN_KEYS) {
      expect(typeof tokens[k]).toBe('string');
    }
  }
});
