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
  | 'meta' // 12pt sans — secondary meta text
  | 'strip'; // 12pt mono, tracked + uppercase — THE metadata-strip treatment

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
  'strip',
];

/**
 * Display-class variants cap Dynamic Type scaling: Anton at 34–44pt with
 * unlimited scaling overflows headers long before it helps legibility.
 * Body-class variants scale freely.
 *
 * `strip` and `label` are metadata, not content: at accessibility-XXXL,
 * uncapped metadata outgrows the content it labels (a strip like
 * "TODAY · 5 EXERCISES" consuming a whole card while its title shrinks to
 * fit). They get the same treatment, looser — some Dynamic Type growth is
 * still earned, just bounded so metadata can never outgrow content.
 */
export function resolveMaxFontSizeMultiplier(variant: TextVariant): number | undefined {
  switch (variant) {
    // The poster (displayXXL) never scales: at 96pt it is already the largest
    // thing on screen, and any growth pushes the long first line into
    // adjustsFontSizeToFit while the short second line stays full size — the
    // two lines desync (TestFlight build 9, Dynamic Type one notch up).
    case 'displayXXL':
      return 1;
    case 'hero':
    case 'displayXL':
    case 'display':
      return 1.2;
    case 'strip':
    case 'label':
      return 1.5;
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
    case 'strip':
      // The ONE mono-strip treatment for metadata runs (`3/3 SETS · 2600 VOL`).
      // Standard ink is inkTertiary at the call site; strips sitting on an
      // INVERTED panel keep the panel ink at 0.65 opacity instead.
      return {
        fontFamily: t.family.mono,
        fontSize: t.size.meta,
        letterSpacing: t.tracking.strip,
        lineHeight: lh(t.size.meta, t.lineHeightMul.meta),
        textTransform: 'uppercase',
      };
  }
}

/**
 * Round-2 P0: RN scales `fontSize` with the OS text-size setting but leaves a
 * numeric `lineHeight` frozen — at accessibility sizes the glyphs outgrow the
 * line box and text visually slices apart (verified live: "5 EXERCISES"
 * rendered as "5 FXFRCISFS" at AX-XL).
 *
 * The line box must track the same EFFECTIVE scale RN applies to fontSize:
 * `min(fontScale, cap)` for a capped variant, raw `fontScale` for an
 * uncapped one. `capOverride` lets a caller (Text.tsx's own
 * `maxFontSizeMultiplier` prop) replace the variant's default cap so the
 * line box always tracks whatever cap actually governs fontSize.
 */
export function scaledLineHeight(
  variant: TextVariant,
  fontScale: number,
  capOverride?: number,
): number {
  const baseLineHeight = resolveTextStyle(variant).lineHeight as number;
  const cap = capOverride ?? resolveMaxFontSizeMultiplier(variant);
  const effectiveScale = cap != null ? Math.min(fontScale, cap) : fontScale;
  return Math.round(baseLineHeight * effectiveScale);
}

// Anton vertical metrics (unitsPerEm 2048), read from the bundled TTF: flat
// caps reach 1760, and the font declares a 674-unit descent that uppercase
// display copy never uses. iOS baselines a forced line box at
// (lineHeight − descent), so that empty descent sits under every line.
const ANTON_CAP_HEIGHT = 1760 / 2048;
const ANTON_DESCENT = 674 / 2048;
// Poster leading: the visual gap between one line's cap bottom and the
// next line's cap top, as a fraction of the font size.
const STACKED_DISPLAY_GAP = 0.08;

/**
 * Negative top margin for the SECOND of two stacked display lines (the
 * poster: "READY TO" over "LIFT."). Each line keeps its full 1.2 em box (the
 * box must not shrink — iOS clips cap tops), so the dead descent is closed
 * by overlap instead: the second line rises until only STACKED_DISPLAY_GAP
 * shows between the caps.
 */
export function stackedDisplayTrim(variant: 'display' | 'displayXL' | 'displayXXL'): number {
  const style = resolveTextStyle(variant);
  const size = style.fontSize as number;
  const lineHeight = style.lineHeight as number;
  const capTopGap = lineHeight - (ANTON_DESCENT + ANTON_CAP_HEIGHT) * size;
  const deadSpace = ANTON_DESCENT * size + capTopGap;
  return -Math.round(deadSpace - STACKED_DISPLAY_GAP * size);
}
