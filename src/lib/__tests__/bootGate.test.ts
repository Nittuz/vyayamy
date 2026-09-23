/**
 * The root navigator must not mount until the custom fonts are registered:
 * React Native resolves fontFamily at text layout and never re-measures a
 * node when the font arrives later, so any screen laid out early keeps the
 * system font for the rest of the process (TestFlight build 7 wordmark bug).
 * A font *failure* still mounts — a fallback font beats a bricked app.
 */
import { canMountNavigator } from '@/lib/bootGate';

describe('canMountNavigator', () => {
  test('holds the navigator while fonts are still loading', () => {
    expect(canMountNavigator(false, null)).toBe(false);
  });

  test('mounts once fonts are loaded', () => {
    expect(canMountNavigator(true, null)).toBe(true);
  });

  test('mounts when font loading failed rather than blocking forever', () => {
    expect(canMountNavigator(false, new Error('font download failed'))).toBe(true);
  });
});
