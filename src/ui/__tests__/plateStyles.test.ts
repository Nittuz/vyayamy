/**
 * The Plate's tone system is the Blacktop materiality contract — pin it.
 * Shadows are retired: a Plate is a flat face; elevation is inversion.
 * Legacy Forged Iron tone values must keep resolving (screens migrate to the
 * explicit new tones in the per-screen phase).
 */
import {
  canonicalTone,
  PRESS_DIP_OPACITY,
  PRESS_HIGHLIGHT_OPACITY,
  PRESS_SCALE,
  PRESS_SCALE_OPACITY,
  resolvePlateStyles,
  resolvePressedStyle,
} from '@/ui/plateStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('dark');

test('the slab is retired: no offset space, no slab layer, ever', () => {
  for (const offset of ['md', 'sm', 'none'] as const) {
    const s = resolvePlateStyles(theme, { offset });
    expect(s.container).toEqual({});
    expect(s.slab).toBeNull();
  }
});

test('panel (default): surface fill, hairline border rule, ink foreground', () => {
  const s = resolvePlateStyles(theme);
  expect(s.face).toMatchObject({
    backgroundColor: theme.color.surface,
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.border,
  });
  // Softened Blacktop: the default shape is a card.
  expect(s.face.borderRadius).toBe(theme.radius.card);
  expect(s.ink).toBe(theme.color.ink);
});

test('inverted: ink fill with bg-colored foreground — elevation by inversion', () => {
  const s = resolvePlateStyles(theme, { tone: 'inverted' });
  expect(s.face).toMatchObject({ backgroundColor: theme.color.ink, borderWidth: 0 });
  expect(s.ink).toBe(theme.color.bg);
});

test('ghost: transparent and borderless', () => {
  const s = resolvePlateStyles(theme, { tone: 'ghost' });
  expect(s.face).toMatchObject({ backgroundColor: 'transparent', borderWidth: 0 });
  expect(s.ink).toBe(theme.color.ink);
});

test('volt: accent fill with onAccent foreground, borderless', () => {
  const s = resolvePlateStyles(theme, { tone: 'volt' });
  expect(s.face).toMatchObject({ backgroundColor: theme.color.accent, borderWidth: 0 });
  expect(s.ink).toBe(theme.color.onAccent);
});

test('legacy tones map onto the new system (compat until screens migrate)', () => {
  expect(canonicalTone('surface')).toBe('panel');
  expect(canonicalTone('surface2')).toBe('panel');
  expect(canonicalTone('bg')).toBe('ghost');
  expect(canonicalTone('accent')).toBe('volt');
  expect(canonicalTone('danger')).toBe('danger');

  expect(resolvePlateStyles(theme, { tone: 'accent' }).face.backgroundColor).toBe(
    theme.color.accent,
  );
  expect(resolvePlateStyles(theme, { tone: 'surface2' }).face.backgroundColor).toBe(
    theme.color.surface,
  );
  expect(resolvePlateStyles(theme, { tone: 'bg' }).face.backgroundColor).toBe('transparent');
  expect(resolvePlateStyles(theme, { tone: 'danger' }).face.backgroundColor).toBe(
    theme.color.danger,
  );
});

test('an explicit border overrides the tone default', () => {
  const strong = resolvePlateStyles(theme, { tone: 'panel', border: 'strong' });
  expect(strong.face).toMatchObject({
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.borderStrong,
  });

  const none = resolvePlateStyles(theme, { tone: 'panel', border: 'none' });
  expect(none.face.borderWidth).toBe(0);
});

test('shape picks the radius: card by default, control for keys, none for bare', () => {
  for (const tone of ['panel', 'inverted', 'ghost', 'volt', 'danger'] as const) {
    expect(resolvePlateStyles(theme, { tone }).face.borderRadius).toBe(theme.radius.card);
    expect(resolvePlateStyles(theme, { tone, shape: 'control' }).face.borderRadius).toBe(
      theme.radius.control,
    );
    expect(resolvePlateStyles(theme, { tone, shape: 'none' }).face).not.toHaveProperty(
      'borderRadius',
    );
  }
});

test('scale press: 0.975 scale with a mild darken; reduced motion keeps only the darken', () => {
  expect(resolvePressedStyle(false, 'scale')).toEqual({
    opacity: PRESS_SCALE_OPACITY,
    transform: [{ scale: PRESS_SCALE }],
  });
  expect(resolvePressedStyle(true, 'scale')).toEqual({ opacity: PRESS_SCALE_OPACITY });
  expect(PRESS_SCALE).toBe(0.975);
  expect(PRESS_SCALE_OPACITY).toBe(0.92);
  // Default press is scale.
  expect(resolvePressedStyle(false)).toEqual(resolvePressedStyle(false, 'scale'));
});

test('highlight press never moves or dims the face — the tint layer carries it', () => {
  expect(resolvePressedStyle(false, 'highlight')).toEqual({});
  expect(resolvePressedStyle(true, 'highlight')).toEqual({});
  expect(PRESS_HIGHLIGHT_OPACITY).toBe(0.08);
});

test('flat pressables keep the legacy dip constant for their own opacity', () => {
  expect(PRESS_DIP_OPACITY).toBe(0.8);
});
