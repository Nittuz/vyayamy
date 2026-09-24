/**
 * Softened Blacktop (spec 2026-09-23): one radius scale for the whole app.
 * control 6 (buttons, inputs, segments, keys), card 8 (Plates, rows, toasts),
 * sheet 16 (bottom-sheet top corners), full (circles). Nothing else exists,
 * so no screen can invent an in-between value.
 */
import { buildTheme } from '@/ui/useTheme';

test('the radius scale is exactly control / card / sheet / full', () => {
  const theme = buildTheme('dark');
  expect(theme.radius).toEqual({ control: 6, card: 8, sheet: 16, full: 9999 });
  // Same object in light: shape is scheme-independent.
  expect(buildTheme('light').radius).toEqual(theme.radius);
});
