/**
 * One text-input style for the whole app (Softened Blacktop). Seven screens
 * used to hand-roll this; drift showed as three different heights and two
 * border colors. Consumers spread it and override only what a field needs
 * (multiline height, a stronger border on the dark Login poster).
 */
import { resolveInputStyle } from '@/ui/inputStyles';
import { buildTheme } from '@/ui/useTheme';

const theme = buildTheme('dark');

test('input: 48pt tall, page fill, soft hairline, control radius, body sans in ink', () => {
  expect(resolveInputStyle(theme)).toEqual({
    height: theme.touch.min + 4,
    paddingHorizontal: theme.space.s4,
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.size.body,
    fontFamily: theme.font.family.sans,
    color: theme.color.ink,
  });
});

test('the style is scheme-aware: light mode swaps fill, border, and ink', () => {
  const light = resolveInputStyle(buildTheme('light'));
  expect(light.backgroundColor).toBe(buildTheme('light').color.bg);
  expect(light.color).toBe(buildTheme('light').color.ink);
  expect(light.borderRadius).toBe(theme.radius.control);
});
