/**
 * The one text-input style (Softened Blacktop, spec 2026-09-23). Pure, like
 * plateStyles.ts, so it is unit-testable. Screens spread the result and
 * override only what a field genuinely needs (NoteSheet's multiline height,
 * Login's stronger hairline on the pinned-dark poster). The noRawRadius guard
 * fails any TextInput style that draws its own border elsewhere.
 */
import type { TextStyle } from 'react-native';

import type { Theme } from './useTheme';

export function resolveInputStyle(theme: Theme): TextStyle {
  return {
    height: theme.touch.min + 4,
    paddingHorizontal: theme.space.s4,
    borderWidth: theme.depth.hairline,
    borderColor: theme.color.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.size.body,
    fontFamily: theme.font.family.sans,
    color: theme.color.ink,
  };
}
