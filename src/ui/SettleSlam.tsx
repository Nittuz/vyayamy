/**
 * SettleSlam — the display-type slam-in entrance (Blacktop motion language):
 * the wrapped headline rises `slam.rise`px into place on the under-damped
 * `settleSlam` spring, once per mount. The ONE shared implementation — screens
 * must not grow private copies (they drift on the opacity clamp and the
 * reduced-motion gate).
 *
 * Reduced motion (useReduceMotion, live — impeccable r2 #I3): renders settled
 * immediately, no animation. The spring overshoots past 1 — that overshoot IS
 * the slam — so opacity clamps at 1 while translateY dips negative.
 */
import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReduceMotion } from './useReduceMotion';
import { useTheme } from './useTheme';

export function SettleSlam({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withSpring(1, theme.motion.spring.settleSlam);
  }, [reduceMotion, progress, theme]);

  const rise = theme.motion.slam.rise;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: (1 - progress.value) * rise }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
