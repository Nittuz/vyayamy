import type { PaletteTokens } from '@/ui/colors';
import { skins, SKIN_IDS, SKIN_META } from '@/ui/skins';

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
