import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { motion } from '@/ui/motion';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { useTheme } from '@/ui/useTheme';

const PULSE_WINDOW_MS = 30_000;
const PERSISTENT_AGE_MS = 5 * 60_000;
const PULSE_LOW = 0.3;
const PULSE_HIGH = 0.7;

function pulseLoop() {
  return withRepeat(
    withSequence(
      withTiming(PULSE_HIGH, { duration: motion.duration.pulse }),
      withTiming(PULSE_LOW, { duration: motion.duration.pulse }),
    ),
    -1,
    false,
  );
}

export function SyncErrorStripe() {
  const theme = useTheme();
  const sync = useSyncStateLive();
  const opacity = useSharedValue(0);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    const now = Date.now();
    const lastErrorMs = sync.lastErrorAt ? new Date(sync.lastErrorAt).getTime() : null;
    const isRecentError = lastErrorMs !== null && now - lastErrorMs < PULSE_WINDOW_MS;
    const isPersistent =
      sync.pendingOutbox > 0 && lastErrorMs !== null && now - lastErrorMs > PERSISTENT_AGE_MS;

    if (isRecentError) {
      if (reduceMotion) {
        // Loops are suppressed under Reduce Motion — hold the stripe steady.
        opacity.value = PULSE_HIGH;
        return;
      }
      // Pulse 0.3 ↔ 0.7
      opacity.value = PULSE_LOW;
      opacity.value = pulseLoop();
      // Known flag (kept for parity with the legacy Animated version, not fixed
      // here): the pulse outlives its 30s window — the timeout snaps the stripe
      // down but the loop resumes until the sync state next changes.
      const t = setTimeout(
        () => {
          opacity.value = 0;
          opacity.value = pulseLoop();
        },
        PULSE_WINDOW_MS - (now - (lastErrorMs ?? now)),
      );
      return () => clearTimeout(t);
    }

    if (isPersistent) {
      opacity.value = withTiming(PULSE_HIGH, { duration: motion.duration.base });
      return;
    }

    opacity.value = withTiming(0, { duration: motion.duration.base });
  }, [sync.lastErrorAt, sync.pendingOutbox, reduceMotion, opacity]);

  useEffect(() => {
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.stripe, { backgroundColor: theme.color.danger }, animatedStyle]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 100,
  },
});
