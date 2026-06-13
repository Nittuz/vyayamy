/**
 * Plate — the Forged Iron card primitive.
 *
 * A face with a 2px structural rule on a hard offset slab. With `onPress` the
 * face becomes a Pressable that sinks toward its slab while pressed — a direct
 * manipulation state (instant style swap), not an animation, so it needs no
 * Reduce Motion gate. Style maths live in plateStyles.ts (pure, tested).
 */
import {
  Pressable,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  resolvePlateStyles,
  type PlateBorder,
  type PlateOffset,
  type PlateTone,
} from './plateStyles';
import { useTheme, type Theme } from './useTheme';

export interface PlateProps {
  offset?: PlateOffset;
  tone?: PlateTone;
  border?: PlateBorder;
  radius?: keyof Theme['radius'];
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** Outer container (margins, flex). */
  style?: StyleProp<ViewStyle>;
  /** The face itself (padding, gap, alignment). */
  faceStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Plate({
  offset = 'md',
  tone = 'surface',
  border = 'strong',
  radius = 'card',
  onPress,
  onLongPress,
  disabled = false,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
  faceStyle,
  children,
}: PlateProps) {
  const theme = useTheme();
  const s = resolvePlateStyles(theme, { offset, tone, border, radius });
  const dim = disabled ? { opacity: 0.5 } : null;

  if (!onPress && !onLongPress) {
    return (
      <View style={[s.container, dim, style]}>
        {s.slab ? <View pointerEvents="none" style={s.slab} /> : null}
        <View style={[s.face, faceStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[s.container, dim, style]}>
      {s.slab ? <View pointerEvents="none" style={s.slab} /> : null}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
        style={({ pressed }) => [s.face, pressed && !disabled ? s.facePressed : null, faceStyle]}
      >
        {children}
      </Pressable>
    </View>
  );
}
