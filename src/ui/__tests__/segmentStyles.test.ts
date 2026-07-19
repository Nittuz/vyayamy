/**
 * The Segment's selected/idle appearance is the design contract for every
 * segmented control (Progress range + metric rows, Profile units) — pin it.
 * Blacktop selection semantics: inversion, never volt.
 */
import { resolveSegmentAppearance } from '@/ui/segmentStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('dark');

test('selected option inverts: ink face, bg-colored type, no border', () => {
  const a = resolveSegmentAppearance(theme, { size: 'md', selected: true });
  expect(a.tone).toBe('inverted');
  expect(a.border).toBe('none');
  expect(a.textColor).toBe(theme.color.bg);
});

test('idle option is a ghost with a hairline rule and secondary ink', () => {
  const a = resolveSegmentAppearance(theme, { size: 'md', selected: false });
  expect(a.tone).toBe('ghost');
  expect(a.border).toBe('soft');
  expect(a.textColor).toBe(theme.color.inkSecondary);
});

test('selection never wears volt — inversion is the only selected treatment', () => {
  for (const size of ['sm', 'md'] as const) {
    const a = resolveSegmentAppearance(theme, { size, selected: true });
    expect(a.tone).not.toBe('volt');
    expect(a.textColor).not.toBe(theme.color.accent);
  }
});

test('md wears card text with wide tracking; sm wears meta text, no tracking', () => {
  const md = resolveSegmentAppearance(theme, { size: 'md', selected: false });
  expect(md.textVariant).toBe('card');
  expect(md.letterSpacing).toBe(1);

  const sm = resolveSegmentAppearance(theme, { size: 'sm', selected: false });
  expect(sm.textVariant).toBe('meta');
  expect(sm.letterSpacing).toBeNull();
});

test('selection changes tone/border/color only — size decides typography', () => {
  const idle = resolveSegmentAppearance(theme, { size: 'sm', selected: false });
  const sel = resolveSegmentAppearance(theme, { size: 'sm', selected: true });
  expect(sel.textVariant).toBe(idle.textVariant);
  expect(sel.letterSpacing).toBe(idle.letterSpacing);
});
