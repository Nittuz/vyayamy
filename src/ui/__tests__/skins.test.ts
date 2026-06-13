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
  'slab',
];

describe('skin registry (collapsed to the single Forged Iron identity)', () => {
  test('exposes exactly the one skin', () => {
    expect(SKIN_IDS).toEqual(['forge']);
  });

  test('the skin has dark+light with the full token shape', () => {
    for (const id of SKIN_IDS) {
      for (const scheme of ['dark', 'light'] as const) {
        const tokens = skins[id][scheme];
        for (const k of TOKEN_KEYS) {
          expect(typeof tokens[k]).toBe('string');
        }
      }
    }
  });

  test('the skin has a display name', () => {
    expect(SKIN_META.forge.name.length).toBeGreaterThan(0);
  });
});

describe('coerceSkin / isSkinId', () => {
  test('default skin is forge', () => {
    expect(DEFAULT_SKIN).toBe('forge');
  });

  test('accepts the valid skin id', () => {
    expect(isSkinId('forge')).toBe(true);
    expect(coerceSkin('forge')).toBe('forge');
  });

  test('migrates legacy persisted skin ids to the default', () => {
    // Existing installs may have 'iron' | 'ember' | 'chalk' in AsyncStorage —
    // they must coerce silently, never crash.
    expect(coerceSkin('iron')).toBe('forge');
    expect(coerceSkin('ember')).toBe('forge');
    expect(coerceSkin('chalk')).toBe('forge');
    expect(isSkinId('ember')).toBe(false);
  });

  test('coerces unknown / null / wrong-type values to the default', () => {
    expect(coerceSkin(null)).toBe('forge');
    expect(coerceSkin(undefined)).toBe('forge');
    expect(coerceSkin('neon')).toBe('forge');
    expect(coerceSkin(42)).toBe('forge');
    expect(isSkinId('neon')).toBe(false);
  });
});
