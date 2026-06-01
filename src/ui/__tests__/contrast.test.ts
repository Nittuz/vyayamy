import type { PaletteTokens } from '@/ui/colors';
import { skins, SKIN_IDS } from '@/ui/skins';

// WCAG relative luminance — sRGB
function luminance(hex: string): number {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const adj = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * adj(r) + 0.7152 * adj(g) + 0.0722 * adj(b);
}

function contrast(a: string, b: string): number {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair {
  paletteName: string;
  ink: keyof PaletteTokens;
  bg: keyof PaletteTokens;
  minRatio: number;
}

const palettes: { name: string; tokens: PaletteTokens }[] = SKIN_IDS.flatMap((id) => [
  { name: `${id}-dark`, tokens: skins[id].dark },
  { name: `${id}-light`, tokens: skins[id].light },
]);

// Body-sized text (normal) requires 4.5:1.
// Large text (18pt+ regular, or 14pt+ bold) requires 3.0:1.
// inkTertiary is used for hints / micro labels; we hold it to 3.0 (treats as large).
const BODY_RATIO = 4.5;
const LARGE_RATIO = 3.0;

const pairs: Pair[] = palettes.flatMap(({ name, tokens: _ }) => [
  { paletteName: name, ink: 'ink', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'ink', bg: 'surface', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkSecondary', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkSecondary', bg: 'surface', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkTertiary', bg: 'bg', minRatio: LARGE_RATIO },
  { paletteName: name, ink: 'inkTertiary', bg: 'surface', minRatio: LARGE_RATIO },
  { paletteName: name, ink: 'inkHero', bg: 'bg', minRatio: BODY_RATIO },
  { paletteName: name, ink: 'inkHero', bg: 'surface', minRatio: BODY_RATIO },
]);

describe('palette contrast (WCAG)', () => {
  for (const p of pairs) {
    const tokens = palettes.find((x) => x.name === p.paletteName)!.tokens;
    const ratio = contrast(tokens[p.ink], tokens[p.bg]);
    test(`${p.paletteName}: ${p.ink} on ${p.bg} >= ${p.minRatio}`, () => {
      expect(ratio).toBeGreaterThanOrEqual(p.minRatio);
    });
  }
});
