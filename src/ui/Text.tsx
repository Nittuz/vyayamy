/**
 * Typed text primitive. <Text variant="title" color={theme.color.ink}>…</Text>
 * binds the family + size + tracking + line-height from the design tokens,
 * so no screen can forget the fontFamily and fall back to the system font (#22).
 *
 * `color` is a convenience for the common case; anything in `style` still wins.
 * Display-class variants get a Dynamic Type cap (see resolveMaxFontSizeMultiplier);
 * an explicit maxFontSizeMultiplier prop overrides it.
 */
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { resolveMaxFontSizeMultiplier, resolveTextStyle, type TextVariant } from './textVariants';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Text({ variant = 'body', color, style, maxFontSizeMultiplier, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? resolveMaxFontSizeMultiplier(variant)}
      style={[resolveTextStyle(variant), color ? { color } : null, style]}
    />
  );
}
