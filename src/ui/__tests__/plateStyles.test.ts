/**
 * The Plate's slab/face geometry is the redesign's depth model — pin it.
 * The face must be able to sink INTO the slab on press, which is why this is
 * an underlay View and not a native shadow (a native shadow translates with
 * the face, so the sink would be invisible).
 */
import { plateOffsetPx, resolvePlateStyles } from '@/ui/plateStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('forge', 'dark');

test('offset maps to depth tokens', () => {
  expect(plateOffsetPx(theme, 'md')).toBe(theme.depth.slab);
  expect(plateOffsetPx(theme, 'sm')).toBe(theme.depth.slabSm);
  expect(plateOffsetPx(theme, 'none')).toBe(0);
});

test('container reserves the slab offset; slab fills the offset rectangle', () => {
  const s = resolvePlateStyles(theme, { offset: 'md' });
  expect(s.container).toEqual({ paddingRight: theme.depth.slab, paddingBottom: theme.depth.slab });
  expect(s.slab).toMatchObject({
    position: 'absolute',
    top: theme.depth.slab,
    left: theme.depth.slab,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.slab,
  });
});

test('face carries the structural rule and tone', () => {
  const s = resolvePlateStyles(theme, { tone: 'surface2', border: 'strong', radius: 'card' });
  expect(s.face).toMatchObject({
    backgroundColor: theme.color.surface2,
    borderWidth: theme.depth.rule,
    borderColor: theme.color.borderStrong,
    borderRadius: theme.radius.card,
  });
});

test('pressed face sinks toward the slab, capped by slab depth', () => {
  const md = resolvePlateStyles(theme, { offset: 'md' });
  expect(md.facePressed.transform).toEqual([
    { translateX: theme.press.translate },
    { translateY: theme.press.translate },
  ]);

  // A shallow slab caps the sink — the face never overshoots its slab.
  const sm = resolvePlateStyles(theme, { offset: 'sm' });
  const sink = Math.min(theme.press.translate, theme.depth.slabSm);
  expect(sm.facePressed.transform).toEqual([{ translateX: sink }, { translateY: sink }]);
});

test('flat plates have no slab and do not move when pressed', () => {
  const s = resolvePlateStyles(theme, { offset: 'none' });
  expect(s.slab).toBeNull();
  expect(s.container).toEqual({});
  expect(s.facePressed).toEqual({});
});

test('accent and danger tones fill from the palette', () => {
  expect(resolvePlateStyles(theme, { tone: 'accent' }).face.backgroundColor).toBe(
    theme.color.accent,
  );
  expect(resolvePlateStyles(theme, { tone: 'danger' }).face.backgroundColor).toBe(
    theme.color.danger,
  );
});
