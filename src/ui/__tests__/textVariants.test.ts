/**
 * Regression guard for deep-review #22:
 *   "Half the app renders in the system font — Geist is only applied where a
 *    fontFamily was hand-passed."
 *
 * Every text variant must bind an explicit loaded family, the right size, and
 * the right tracking/transform, so a <Text variant=...> can never silently fall
 * back to the system font. The Text primitive is built on this pure resolver.
 */
import {
  resolveMaxFontSizeMultiplier,
  resolveTextStyle,
  scaledLineHeight,
  TEXT_VARIANTS,
} from '@/ui/textVariants';
import { typography } from '@/ui/typography';

test('every variant binds a loaded family (no system-font fallback)', () => {
  for (const variant of TEXT_VARIANTS) {
    const style = resolveTextStyle(variant);
    expect(String(style.fontFamily)).toMatch(/^(Geist|Anton)/);
  }
});

test('numeric/data variants use mono; display uses condensed; text uses sans', () => {
  expect(resolveTextStyle('hero').fontFamily).toBe(typography.family.monoMedium);
  expect(resolveTextStyle('numeral').fontFamily).toBe(typography.family.mono);
  expect(resolveTextStyle('numeralLg').fontFamily).toBe(typography.family.monoMedium);
  expect(resolveTextStyle('display').fontFamily).toBe(typography.family.condensed);
  expect(resolveTextStyle('displayXL').fontFamily).toBe(typography.family.condensed);
  expect(resolveTextStyle('displayXXL').fontFamily).toBe(typography.family.condensed);
  expect(resolveTextStyle('title').fontFamily).toBe(typography.family.sansSemibold);
  expect(resolveTextStyle('body').fontFamily).toBe(typography.family.sans);
});

test('display variants are uppercase chrome; title/card stay user-text safe', () => {
  expect(resolveTextStyle('display').textTransform).toBe('uppercase');
  expect(resolveTextStyle('displayXL').textTransform).toBe('uppercase');
  expect(resolveTextStyle('displayXXL').textTransform).toBe('uppercase');
  expect(resolveTextStyle('title').textTransform).toBeUndefined();
  expect(resolveTextStyle('card').textTransform).toBeUndefined();
});

test('displayXXL is the 96pt poster face with negative tracking', () => {
  const s = resolveTextStyle('displayXXL');
  expect(s.fontSize).toBe(96);
  expect(s.letterSpacing).toBe(typography.tracking.displayXXL);
  expect(typography.tracking.displayXXL).toBe(-1);
});

test('sizes and the uppercase label transform come from the tokens', () => {
  expect(resolveTextStyle('hero').fontSize).toBe(typography.size.hero);
  expect(resolveTextStyle('display').fontSize).toBe(typography.size.display);
  expect(resolveTextStyle('displayXL').fontSize).toBe(typography.size.displayXL);
  expect(resolveTextStyle('numeralLg').fontSize).toBe(typography.size.numeralLg);
  expect(resolveTextStyle('title').fontSize).toBe(typography.size.title);
  expect(resolveTextStyle('label').textTransform).toBe('uppercase');
  expect(resolveTextStyle('label').letterSpacing).toBe(typography.tracking.micro);
  // line-height is resolved to an absolute value (token mul × size)
  expect(resolveTextStyle('body').lineHeight).toBe(
    Math.round(typography.size.body * typography.lineHeightMul.body),
  );
});

test('line boxes never dip below the font size (iOS clips tall glyphs sub-1)', () => {
  for (const variant of TEXT_VARIANTS) {
    const style = resolveTextStyle(variant);
    expect(style.lineHeight!).toBeGreaterThanOrEqual(style.fontSize!);
  }
});

test('display line boxes clear Anton cap tops (iOS baselines at lineHeight − descent)', () => {
  // On iOS, TextKit under a forced lineHeight puts the baseline at
  // lineHeight − descent, so everything above (lineHeight − descent) is
  // clipped off the first line. Anton (unitsPerEm 2048) reaches yMax 1776
  // on round caps (O G S Q 0) and descends 674, so the line box must be at
  // least (1776 + 674) / 2048 ≈ 1.1963 em — measured from the TTF, and
  // verified against an 11px top slice on device at 1.1.
  const ANTON_MIN_LINE_BOX = (1776 + 674) / 2048;
  for (const variant of ['display', 'displayXL', 'displayXXL'] as const) {
    const style = resolveTextStyle(variant);
    expect(style.lineHeight!).toBeGreaterThanOrEqual(style.fontSize! * ANTON_MIN_LINE_BOX);
  }
});

test('display-class variants cap Dynamic Type scaling; body-class scales freely', () => {
  expect(resolveMaxFontSizeMultiplier('hero')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('display')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('displayXL')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('displayXXL')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('body')).toBeUndefined();
  expect(resolveMaxFontSizeMultiplier('meta')).toBeUndefined();
});

// Impeccable batch 4 / P1: at accessibility-XXXL, uncapped metadata (strip,
// label) outgrew the content it labels ("TODAY · 5 EXERCISES" consuming the
// whole card). Mirrors the display-class cap mechanism above, but looser —
// metadata still earns some Dynamic Type growth, just not unbounded growth.
test('metadata variants (strip, label) cap at 1.5x; body/meta stay uncapped', () => {
  expect(resolveMaxFontSizeMultiplier('strip')).toBe(1.5);
  expect(resolveMaxFontSizeMultiplier('label')).toBe(1.5);
  expect(resolveMaxFontSizeMultiplier('body')).toBeUndefined();
  expect(resolveMaxFontSizeMultiplier('meta')).toBeUndefined();
  expect(resolveMaxFontSizeMultiplier('numeral')).toBeUndefined();
  expect(resolveMaxFontSizeMultiplier('numeralLg')).toBeUndefined();
});

// Round-2 P0: RN scales fontSize with the OS text-size setting but leaves a
// numeric lineHeight frozen, so at accessibility sizes glyphs outgrow the
// line box and text visually slices apart ("5 EXERCISES" → "5 FXFRCISFS" at
// AX-XL, verified live). The line box must track the same EFFECTIVE scale RN
// applies to fontSize: min(fontScale, cap) for capped variants, raw
// fontScale for uncapped ones.
describe('scaledLineHeight — line boxes track the effective font scale', () => {
  test('fontScale 1 leaves the base line height unchanged', () => {
    expect(scaledLineHeight('body', 1)).toBe(resolveTextStyle('body').lineHeight);
    expect(scaledLineHeight('title', 1)).toBe(resolveTextStyle('title').lineHeight);
  });

  test('a capped display variant clamps to its 1.2x cap, not the raw scale', () => {
    const base = resolveTextStyle('display').lineHeight!;
    expect(scaledLineHeight('display', 3)).toBe(Math.round(base * 1.2));
  });

  test('capped metadata (strip) clamps to its looser 1.5x cap', () => {
    const base = resolveTextStyle('strip').lineHeight!;
    expect(scaledLineHeight('strip', 3)).toBe(Math.round(base * 1.5));
  });

  test('uncapped body-class variant scales freely with fontScale', () => {
    const base = resolveTextStyle('body').lineHeight!;
    expect(scaledLineHeight('body', 2)).toBe(Math.round(base * 2));
  });

  test('rounds to the nearest integer', () => {
    // meta: base line height is 12 * 1.6 = 19.2 → rounds to 19; scaled by an
    // uncapped 1.5x gives 28.5, which must round up to 29 (not truncate to 28).
    const base = resolveTextStyle('meta').lineHeight!;
    expect(base).toBe(19);
    expect(scaledLineHeight('meta', 1.5)).toBe(29);
  });

  test('an explicit capOverride replaces the variant default cap', () => {
    // Text.tsx threads its own maxFontSizeMultiplier prop through as a
    // capOverride, so it must win over both "no cap" and the variant's cap.
    const bodyBase = resolveTextStyle('body').lineHeight!; // uncapped by default
    expect(scaledLineHeight('body', 3, 1.5)).toBe(Math.round(bodyBase * 1.5));

    const displayBase = resolveTextStyle('display').lineHeight!; // capped at 1.2 by default
    expect(scaledLineHeight('display', 3, 2)).toBe(Math.round(displayBase * 2));
  });
});
