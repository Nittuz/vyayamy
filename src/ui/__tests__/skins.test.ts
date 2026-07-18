import type { PaletteTokens } from '@/ui/colors';
import { skins, DEFAULT_SKIN } from '@/ui/skins';

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

describe('skin registry (collapsed to the single Forged Iron identity)', () => {
  test('exposes exactly the one skin, which is the default', () => {
    expect(Object.keys(skins)).toEqual(['forge']);
    expect(DEFAULT_SKIN).toBe('forge');
  });

  test('the skin has dark+light with the full token shape', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const tokens = skins[DEFAULT_SKIN][scheme];
      for (const k of TOKEN_KEYS) {
        expect(typeof tokens[k]).toBe('string');
      }
    }
  });
});
