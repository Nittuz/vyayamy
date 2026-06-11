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
  expect(buildTheme('iron', 'light')).toBe(buildTheme('iron', 'light'));
});

test('returns distinct objects for different skin or scheme', () => {
  expect(buildTheme('forge', 'dark')).not.toBe(buildTheme('forge', 'light'));
  expect(buildTheme('forge', 'dark')).not.toBe(buildTheme('iron', 'dark'));
});

test('carries the right palette and scheme', () => {
  const t = buildTheme('ember', 'light');
  expect(t.scheme).toBe('light');
  expect(t.color).toBe(skins.ember.light);
});
