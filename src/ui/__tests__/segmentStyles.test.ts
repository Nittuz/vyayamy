/**
 * The Segment's selected/idle appearance is the design contract for every
 * segmented control (Progress range + metric rows, Profile units) — pin it.
 */
import { resolveSegmentAppearance } from '@/ui/segmentStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('forge', 'dark');

test('selected option fills ember with onAccent text', () => {
  const a = resolveSegmentAppearance(theme, { size: 'md', selected: true });
  expect(a.tone).toBe('accent');
  expect(a.textColor).toBe(theme.color.onAccent);
});

test('idle option sits on surface2 with secondary ink', () => {
  const a = resolveSegmentAppearance(theme, { size: 'md', selected: false });
  expect(a.tone).toBe('surface2');
  expect(a.textColor).toBe(theme.color.inkSecondary);
});

test('md wears card text with wide tracking; sm wears meta text, no tracking', () => {
  const md = resolveSegmentAppearance(theme, { size: 'md', selected: false });
  expect(md.textVariant).toBe('card');
  expect(md.letterSpacing).toBe(1);

  const sm = resolveSegmentAppearance(theme, { size: 'sm', selected: false });
  expect(sm.textVariant).toBe('meta');
  expect(sm.letterSpacing).toBeNull();
});

test('selection changes tone/color only — size decides typography', () => {
  const idle = resolveSegmentAppearance(theme, { size: 'sm', selected: false });
  const sel = resolveSegmentAppearance(theme, { size: 'sm', selected: true });
  expect(sel.textVariant).toBe(idle.textVariant);
  expect(sel.letterSpacing).toBe(idle.letterSpacing);
});
