/**
 * Typed text primitive. <Text variant="title" color={theme.color.ink}>…</Text>
 * binds the family + size + tracking + line-height from the design tokens,
 * so no screen can forget the fontFamily and fall back to the system font (#22).
 *
 * `color` is a convenience for the common case; anything in `style` still wins.
 * Display-class variants get a Dynamic Type cap (see resolveMaxFontSizeMultiplier);
 * an explicit maxFontSizeMultiplier prop overrides it.
 */
import {
  Text as RNText,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

import {
  resolveMaxFontSizeMultiplier,
  resolveTextStyle,
  scaledLineHeight,
  type TextVariant,
} from './textVariants';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Text({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  // Round-2 P0: the line box must track the same effective cap that governs
  // fontSize below, including a caller-supplied maxFontSizeMultiplier override
  // (resolveMaxFontSizeMultiplier(variant) is the fallback when none is passed).
  const { fontScale } = useWindowDimensions();
  const cap = maxFontSizeMultiplier ?? resolveMaxFontSizeMultiplier(variant);
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={cap}
      style={[
        resolveTextStyle(variant),
        { lineHeight: scaledLineHeight(variant, fontScale, cap) },
        color ? { color } : null,
        style,
      ]}
    />
  );
}
