/**
 * Regression guard for deep-review #48:
 *   "useTheme returns a new object identity every render, silently defeating all
 *    nine useMemo(makeStyles, [theme]) sites."
 *
 * buildTheme caches by (skin, scheme), so every consumer gets the SAME theme
 * object for a given skin × scheme — makeStyles memos then actually cache.
 */
import { buildTheme } from '@/ui/useTheme';
import { skins } from '@/ui/skins';

test('returns a STABLE reference for the same skin and scheme (#48)', () => {
  expect(buildTheme('forge', 'dark')).toBe(buildTheme('forge', 'dark'));
  expect(buildTheme('forge', 'light')).toBe(buildTheme('forge', 'light'));
});

test('returns distinct objects for different schemes', () => {
  expect(buildTheme('forge', 'dark')).not.toBe(buildTheme('forge', 'light'));
});

test('carries the right palette, scheme, and depth tokens', () => {
  const t = buildTheme('forge', 'light');
  expect(t.scheme).toBe('light');
  expect(t.color).toBe(skins.forge.light);
  // Blacktop rule weights ride on the theme; the retired slab/press tokens
  // survive for legacy consumers until the per-screen phase removes them.
  expect(t.depth.hairline).toBe(1.5);
  expect(t.depth.rule).toBeGreaterThanOrEqual(2);
  expect(t.depth.slab).toBeGreaterThan(0);
  expect(t.press.translate).toBeGreaterThan(0);
});
