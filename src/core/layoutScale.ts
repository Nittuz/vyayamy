/**
 * Layout branches driven by the OS text size.
 *
 * iOS standard Dynamic Type sizes scale body text up to about 1.35×; the five
 * accessibility sizes start near 1.6× and reach past 3×. A horizontal control
 * row that fits at 1.35× cannot fit at 1.9× (HIG review 2026-10-04: the
 * workout bottom bar's LOG SET label became a column covering the set card),
 * so rows of controls switch to a column at and above this threshold.
 */
export const STACKED_LAYOUT_FONT_SCALE = 1.5;

export function isStackedLayout(fontScale: number): boolean {
  return fontScale >= STACKED_LAYOUT_FONT_SCALE;
}
