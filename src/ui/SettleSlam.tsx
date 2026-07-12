/**
 * SettleSlam — the display-type slam-in entrance (Blacktop motion language):
 * the wrapped headline rises `slam.rise`px into place on the under-damped
 * `settleSlam` spring, once per mount. The ONE shared implementation — screens
 * must not grow private copies (they drift on the opacity clamp and the
 * reduced-motion gate).
 *
 * Reduced motion (read once on mount, FadeInView precedent): renders settled
 * immediately, no animation. The spring overshoots past 1 — that overshoot IS
 * the slam — so opacity clamps at 1 while translateY dips negative.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

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
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        if (active) setReduceMotion(r);
      })
      .catch(() => {
        if (active) setReduceMotion(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
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
