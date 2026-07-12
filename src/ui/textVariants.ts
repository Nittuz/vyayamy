/**
 * Pure text-variant → style resolver (no react-native runtime import, so it is
 * testable). The <Text> primitive in Text.tsx binds these so the family, size,
 * tracking, and transform are applied consistently — a screen can never forget
 * the fontFamily and silently render the system font (#22).
 *
 * Display variants (display/displayXL) are uppercase Anton — app chrome only.
 * User content stays on title/card so it is never force-uppercased.
 */
import type { TextStyle } from 'react-native';

import { typography as t } from './typography';

export type TextVariant =
  | 'hero' // 82pt mono numerals — the active-set headline
  | 'numeral' // mono data figures inline
  | 'numeralLg' // 28pt mono — rest countdown, volume tally, recap stats
  | 'displayXXL' // 96pt condensed uppercase — the one poster moment per screen
  | 'displayXL' // 44pt condensed uppercase — wordmark, recap headline, brand moments
  | 'display' // 34pt condensed uppercase — screen titles
  | 'title' // 20pt sans — in-content headings (user text safe)
  | 'card' // 16pt sans — card headings
  | 'body' // 14pt sans — body copy
  | 'label' // 12pt sans, tracked + uppercase — eyebrows/labels
  | 'meta'; // 12pt sans — secondary meta text

export const TEXT_VARIANTS: TextVariant[] = [
  'hero',
  'numeral',
  'numeralLg',
  'displayXXL',
  'displayXL',
  'display',
  'title',
  'card',
  'body',
  'label',
  'meta',
];

/**
 * Display-class variants cap Dynamic Type scaling: Anton at 34–44pt with
 * unlimited scaling overflows headers long before it helps legibility.
 * Body-class variants scale freely.
 */
export function resolveMaxFontSizeMultiplier(variant: TextVariant): number | undefined {
  switch (variant) {
    case 'hero':
    case 'displayXXL':
    case 'displayXL':
    case 'display':
      return 1.2;
    default:
      return undefined;
  }
}

const lh = (size: number, mul: number) => Math.round(size * mul);

export function resolveTextStyle(variant: TextVariant): TextStyle {
  switch (variant) {
    case 'hero':
      return {
        fontFamily: t.family.monoMedium,
        fontSize: t.size.hero,
        letterSpacing: t.tracking.hero,
        lineHeight: lh(t.size.hero, t.lineHeightMul.hero),
      };
    case 'numeral':
      return {
        fontFamily: t.family.mono,
        fontSize: t.size.card,
        letterSpacing: 0,
        lineHeight: lh(t.size.card, t.lineHeightMul.body),
      };
    case 'numeralLg':
      return {
        fontFamily: t.family.monoMedium,
        fontSize: t.size.numeralLg,
        letterSpacing: t.tracking.numeralLg,
        lineHeight: lh(t.size.numeralLg, t.lineHeightMul.title),
      };
    case 'displayXXL':
      return {
        fontFamily: t.family.condensed,
        fontSize: t.size.displayXXL,
        letterSpacing: t.tracking.displayXXL,
        lineHeight: lh(t.size.displayXXL, t.lineHeightMul.displayXXL),
        textTransform: 'uppercase',
      };
    case 'displayXL':
      return {
        fontFamily: t.family.condensed,
        fontSize: t.size.displayXL,
        letterSpacing: t.tracking.condensed,
        lineHeight: lh(t.size.displayXL, t.lineHeightMul.displayXL),
        textTransform: 'uppercase',
      };
    case 'display':
      return {
        fontFamily: t.family.condensed,
        fontSize: t.size.display,
        letterSpacing: t.tracking.condensed,
        lineHeight: lh(t.size.display, t.lineHeightMul.display),
        textTransform: 'uppercase',
      };
    case 'title':
      return {
        fontFamily: t.family.sansSemibold,
        fontSize: t.size.title,
        letterSpacing: t.tracking.title,
        lineHeight: lh(t.size.title, t.lineHeightMul.title),
      };
    case 'card':
      return {
        fontFamily: t.family.sansMedium,
        fontSize: t.size.card,
        letterSpacing: 0,
        lineHeight: lh(t.size.card, t.lineHeightMul.body),
      };
    case 'body':
      return {
        fontFamily: t.family.sans,
        fontSize: t.size.body,
        letterSpacing: 0,
        lineHeight: lh(t.size.body, t.lineHeightMul.body),
      };
    case 'label':
      return {
        fontFamily: t.family.sansMedium,
        fontSize: t.size.micro,
        letterSpacing: t.tracking.micro,
        lineHeight: lh(t.size.micro, t.lineHeightMul.meta),
        textTransform: 'uppercase',
      };
    case 'meta':
      return {
        fontFamily: t.family.sans,
        fontSize: t.size.meta,
        letterSpacing: 0,
        lineHeight: lh(t.size.meta, t.lineHeightMul.meta),
      };
  }
}
