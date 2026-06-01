/**
 * List-mount motion — opacity 0→1 + a small translateY rise on mount.
 * The one ambient motion the design allows on entrances; honors reduced motion
 * (renders fully visible, no animation) and supports a stagger `delay`.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion } from './motion';

export function FadeInView({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle | ViewStyle[];
}) {
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
    } else {
      progress.value = withDelay(delay, withTiming(1, { duration: motion.duration.base }));
    }
  }, [reduceMotion, delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
