/**
 * Regression guard for deep-review #22:
 *   "Half the app renders in the system font — Geist is only applied where a
 *    fontFamily was hand-passed."
 *
 * Every text variant must bind an explicit loaded family, the right size, and
 * the right tracking/transform, so a <Text variant=...> can never silently fall
 * back to the system font. The Text primitive is built on this pure resolver.
 */
import { resolveMaxFontSizeMultiplier, resolveTextStyle, TEXT_VARIANTS } from '@/ui/textVariants';
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
  expect(resolveTextStyle('title').fontFamily).toBe(typography.family.sansSemibold);
  expect(resolveTextStyle('body').fontFamily).toBe(typography.family.sans);
});

test('display variants are uppercase chrome; title/card stay user-text safe', () => {
  expect(resolveTextStyle('display').textTransform).toBe('uppercase');
  expect(resolveTextStyle('displayXL').textTransform).toBe('uppercase');
  expect(resolveTextStyle('title').textTransform).toBeUndefined();
  expect(resolveTextStyle('card').textTransform).toBeUndefined();
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
  expect(resolveTextStyle('body').lineHeight).toBe(Math.round(typography.size.body * typography.lineHeightMul.body));
});

test('line boxes never dip below the font size (iOS clips tall glyphs sub-1)', () => {
  for (const variant of TEXT_VARIANTS) {
    const style = resolveTextStyle(variant);
    expect(style.lineHeight!).toBeGreaterThanOrEqual(style.fontSize!);
  }
});

test('display-class variants cap Dynamic Type scaling; body-class scales freely', () => {
  expect(resolveMaxFontSizeMultiplier('hero')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('display')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('displayXL')).toBe(1.2);
  expect(resolveMaxFontSizeMultiplier('body')).toBeUndefined();
  expect(resolveMaxFontSizeMultiplier('meta')).toBeUndefined();
});
