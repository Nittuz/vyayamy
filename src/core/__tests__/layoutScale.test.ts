import { isStackedLayout, STACKED_LAYOUT_FONT_SCALE } from '@/core/layoutScale';

describe('isStackedLayout', () => {
  test('standard Dynamic Type sizes keep the row', () => {
    // xSmall … xxxLarge span roughly 0.82 to 1.35 on iOS.
    for (const scale of [0.82, 1, 1.12, 1.23, 1.35]) expect(isStackedLayout(scale)).toBe(false);
  });

  test('accessibility sizes stack', () => {
    // AX medium … AX xxxLarge span roughly 1.6 to 3.1.
    for (const scale of [1.6, 1.9, 2.35, 2.76, 3.12]) expect(isStackedLayout(scale)).toBe(true);
  });

  test('the threshold itself stacks', () => {
    expect(isStackedLayout(STACKED_LAYOUT_FONT_SCALE)).toBe(true);
  });
});
