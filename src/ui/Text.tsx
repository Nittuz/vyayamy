/**
 * Typed text primitive. <Text variant="title" color={theme.color.ink}>…</Text>
 * binds the Geist family + size + tracking + line-height from the design tokens,
 * so no screen can forget the fontFamily and fall back to the system font (#22).
 *
 * `color` is a convenience for the common case; anything in `style` still wins.
 */
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { resolveTextStyle, type TextVariant } from './textVariants';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Text({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[resolveTextStyle(variant), color ? { color } : null, style]} />;
}
