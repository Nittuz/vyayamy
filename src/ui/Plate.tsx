/**
 * Plate — the Blacktop card primitive.
 *
 * A flat face whose tone decides fill, ink, and border (panel / inverted /
 * ghost / volt — see plateStyles.ts). The slab shadow and press-sink translate
 * retired with the overhaul: press feedback is now a 60ms opacity dip plus a
 * 0.985 scale (reduced motion: instant opacity dip only). Style maths live in
 * plateStyles.ts (pure, tested).
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  PRESS_DIP_OPACITY,
  PRESS_DIP_SCALE,
  resolvePlateStyles,
  type PlateBorder,
  type PlateOffset,
  type PlateTone,
} from './plateStyles';
import { useReduceMotion } from './useReduceMotion';
import { useTheme, type Theme } from './useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PlateProps {
  /** Legacy prop — slab offsets are retired; accepted and ignored. */
  offset?: PlateOffset;
  tone?: PlateTone;
  /** Omit to take the tone's default border. */
  border?: PlateBorder;
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
  tone = 'panel',
  border,
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
  const s = resolvePlateStyles(theme, { tone, border });
  const dim = disabled ? { opacity: 0.5 } : null;

  // A ref, not state, so the press handlers keep stable identities — synced
  // from the live hook. Only read from event handlers (never mid-render), so
  // the sync can run in an effect rather than during render.
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const faceOpacity = useSharedValue(1);
  const faceScale = useSharedValue(1);
  const pressMs = theme.motion.duration.press;

  const handlePressIn = useCallback(() => {
    if (reduceMotionRef.current) {
      // Opacity only, instant — no timing, no scale.
      faceOpacity.value = PRESS_DIP_OPACITY;
      return;
    }
    faceOpacity.value = withTiming(PRESS_DIP_OPACITY, { duration: pressMs });
    faceScale.value = withTiming(PRESS_DIP_SCALE, { duration: pressMs });
  }, [faceOpacity, faceScale, pressMs]);

  const handlePressOut = useCallback(() => {
    if (reduceMotionRef.current) {
      faceOpacity.value = 1;
      return;
    }
    faceOpacity.value = withTiming(1, { duration: pressMs });
    faceScale.value = withTiming(1, { duration: pressMs });
  }, [faceOpacity, faceScale, pressMs]);

  const pressedFace = useAnimatedStyle(() => ({
    opacity: faceOpacity.value,
    transform: [{ scale: faceScale.value }],
  }));

  if (!onPress && !onLongPress) {
    return (
      <View style={[s.container, dim, style]}>
        <View style={[s.face, faceStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[s.container, dim, style]}>
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
        style={[s.face, pressedFace, faceStyle]}
      >
        {children}
      </AnimatedPressable>
    </View>
  );
}
