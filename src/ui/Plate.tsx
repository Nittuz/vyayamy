/**
 * Plate — the Softened Blacktop card primitive.
 *
 * A flat, lightly rounded face whose tone decides fill, ink, and border and
 * whose `shape` decides the radius (card / control / none — see
 * plateStyles.ts). Press feedback is one of two responses: `scale` (cards,
 * filled buttons: 0.975 scale + darken over motion.duration.press) or
 * `highlight` (rows, outlined/ghost buttons: a tint layer over the face, no
 * movement). Reduced motion: scale drops its transform and both responses
 * apply instantly. Style maths live in plateStyles.ts (pure, tested).
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  PRESS_HIGHLIGHT_OPACITY,
  PRESS_SCALE,
  PRESS_SCALE_OPACITY,
  resolvePlateStyles,
  type PlateBorder,
  type PlateOffset,
  type PlatePress,
  type PlateShape,
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
  /** Corner treatment; omit for `card`. `none` for rows inside a rule-separated list. */
  shape?: PlateShape;
  /** Press response; omit for `scale`. Rows and outlined controls pass `highlight`. */
  press?: PlatePress;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /**
   * Set false to skip the automatic 0.5-opacity dim while `disabled` — for a
   * caller (Button's filled kinds) that supplies its own honest disabled
   * face/ink via `faceStyle` instead of a translucency smear. Defaults true,
   * so every existing Plate caller keeps today's dim untouched.
   */
  dimWhenDisabled?: boolean;
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
  shape = 'card',
  onPress,
  onLongPress,
  press = 'scale',
  disabled = false,
  dimWhenDisabled = true,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
  faceStyle,
  children,
}: PlateProps) {
  const theme = useTheme();
  const s = resolvePlateStyles(theme, { tone, border, shape });
  const dim = disabled && dimWhenDisabled ? { opacity: 0.5 } : null;

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
  const tintOpacity = useSharedValue(0);
  const pressMs = theme.motion.duration.press;

  const handlePressIn = useCallback(() => {
    if (press === 'highlight') {
      tintOpacity.value = reduceMotionRef.current
        ? PRESS_HIGHLIGHT_OPACITY
        : withTiming(PRESS_HIGHLIGHT_OPACITY, { duration: pressMs });
      return;
    }
    if (reduceMotionRef.current) {
      faceOpacity.value = PRESS_SCALE_OPACITY;
      return;
    }
    faceOpacity.value = withTiming(PRESS_SCALE_OPACITY, { duration: pressMs });
    faceScale.value = withTiming(PRESS_SCALE, { duration: pressMs });
  }, [press, faceOpacity, faceScale, tintOpacity, pressMs]);

  const handlePressOut = useCallback(() => {
    if (press === 'highlight') {
      tintOpacity.value = reduceMotionRef.current ? 0 : withTiming(0, { duration: pressMs });
      return;
    }
    if (reduceMotionRef.current) {
      faceOpacity.value = 1;
      return;
    }
    faceOpacity.value = withTiming(1, { duration: pressMs });
    faceScale.value = withTiming(1, { duration: pressMs });
  }, [press, faceOpacity, faceScale, tintOpacity, pressMs]);

  const pressedFace = useAnimatedStyle(() => ({
    opacity: faceOpacity.value,
    transform: [{ scale: faceScale.value }],
  }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: tintOpacity.value }));

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
        {press === 'highlight' ? (
          // The highlight: the face's own foreground ink at PRESS_HIGHLIGHT_OPACITY,
          // clipped to the face's corners. Sits above the children so the tint
          // covers text too, exactly like a native list-row highlight.
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: s.ink, borderRadius: s.face.borderRadius },
              tintStyle,
            ]}
          />
        ) : null}
      </AnimatedPressable>
    </View>
  );
}
