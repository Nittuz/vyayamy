/**
 * Pure text-variant → style resolver (no react-native runtime import, so it is
 * testable). The <Text> primitive in Text.tsx binds these so the Geist family,
 * size, tracking, and transform are applied consistently — a screen can never
 * forget the fontFamily and silently render the system font (#22).
 */
import type { TextStyle } from 'react-native';

import { typography as t } from './typography';

export type TextVariant =
  | 'hero' // 82pt mono numerals — the active-set headline
  | 'numeral' // mono data figures inline
  | 'display' // 28pt sans — screen-defining numbers/headlines
  | 'title' // 20pt sans — screen titles
  | 'card' // 16pt sans — card headings
  | 'body' // 14pt sans — body copy
  | 'label' // 12pt sans, tracked + uppercase — eyebrows/labels
  | 'meta'; // 12pt sans — secondary meta text

export const TEXT_VARIANTS: TextVariant[] = [
  'hero',
  'numeral',
  'display',
  'title',
  'card',
  'body',
  'label',
  'meta',
];

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
    case 'display':
      return {
        fontFamily: t.family.sansSemibold,
        fontSize: t.size.display,
        letterSpacing: t.tracking.display,
        lineHeight: lh(t.size.display, t.lineHeightMul.title),
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
