import type { PaletteTokens } from '@/ui/colors';
import { skins, SKIN_IDS, SKIN_META, coerceSkin, isSkinId, DEFAULT_SKIN } from '@/ui/skins';

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

describe('skin registry', () => {
  test('exposes all four skins', () => {
    expect(SKIN_IDS).toEqual(['forge', 'iron', 'ember', 'chalk']);
  });

  test('every skin has dark+light with the full token shape', () => {
    for (const id of SKIN_IDS) {
      for (const scheme of ['dark', 'light'] as const) {
        const tokens = skins[id][scheme];
        for (const k of TOKEN_KEYS) {
          expect(typeof tokens[k]).toBe('string');
        }
      }
    }
  });

  test('every skin has a display name', () => {
    for (const id of SKIN_IDS) {
      expect(SKIN_META[id].name.length).toBeGreaterThan(0);
    }
  });
});

describe('coerceSkin / isSkinId', () => {
  test('default skin is forge', () => {
    expect(DEFAULT_SKIN).toBe('forge');
  });

  test('accepts every valid skin id', () => {
    for (const id of SKIN_IDS) {
      expect(isSkinId(id)).toBe(true);
      expect(coerceSkin(id)).toBe(id);
    }
  });

  test('coerces unknown / null / wrong-type values to the default', () => {
    expect(coerceSkin(null)).toBe('forge');
    expect(coerceSkin(undefined)).toBe('forge');
    expect(coerceSkin('neon')).toBe('forge');
    expect(coerceSkin(42)).toBe('forge');
    expect(isSkinId('neon')).toBe(false);
  });
});
