/**
 * Regression guard for deep-review #22:
 *   "Half the app renders in the system font — Geist is only applied where a
 *    fontFamily was hand-passed."
 *
 * Every text variant must bind a Geist family, the right size, and the right
 * tracking/transform, so a <Text variant=...> can never silently fall back to
 * the system font. The Text primitive is built on this pure resolver.
 */
import { resolveTextStyle, TEXT_VARIANTS } from '@/ui/textVariants';
import { typography } from '@/ui/typography';

test('every variant binds a Geist family (no system-font fallback)', () => {
  for (const variant of TEXT_VARIANTS) {
    const style = resolveTextStyle(variant);
    expect(String(style.fontFamily)).toMatch(/^Geist/);
  }
});

test('numeric/data variants use the mono family; text variants use sans', () => {
  expect(resolveTextStyle('hero').fontFamily).toBe(typography.family.monoMedium);
  expect(resolveTextStyle('numeral').fontFamily).toBe(typography.family.mono);
  expect(resolveTextStyle('title').fontFamily).toBe(typography.family.sansSemibold);
  expect(resolveTextStyle('body').fontFamily).toBe(typography.family.sans);
});

test('sizes and the uppercase label transform come from the tokens', () => {
  expect(resolveTextStyle('hero').fontSize).toBe(typography.size.hero);
  expect(resolveTextStyle('title').fontSize).toBe(typography.size.title);
  expect(resolveTextStyle('label').textTransform).toBe('uppercase');
  expect(resolveTextStyle('label').letterSpacing).toBe(typography.tracking.micro);
  // line-height is resolved to an absolute value (token mul × size)
  expect(resolveTextStyle('body').lineHeight).toBe(Math.round(typography.size.body * typography.lineHeightMul.body));
});
