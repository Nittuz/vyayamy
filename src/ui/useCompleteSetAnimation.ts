/**
 * Signature complete-set choreography (the visual half).
 *
 * The decision logic lives in `completeSetChoreography.ts` (pure, unit-tested).
 * This hook owns the Reanimated shared values and honors the OS "Reduce Motion"
 * setting: when reduced, the glow is suppressed but the underlying state/value
 * change still happens instantly.
 *
 * Haptics are intentionally NOT fired here — the completion haptic is owned by
 * the interaction surface (ActiveSetCard's swipe) so it lands on the gesture,
 * not after the async write.
 */
import { useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { computeChoreography } from './completeSetChoreography';
import { duration } from './motion';

export function useCompleteSetAnimation() {
  const glowOpacity = useSharedValue(0);

  /** Bloom the accent glow once, unless reduced motion is on. Pass isPR to give
   *  a personal record a stronger bloom. */
  const pulse = useCallback(
    async (isPR = false) => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        /* default: motion allowed */
      }
      const c = computeChoreography({ reduceMotion, isPR });
      if (c.glow) {
        glowOpacity.value = withSequence(
          withTiming(c.glowPeak, { duration: duration.base }),
          withTiming(0, { duration: duration.base }),
        );
      }
    },
    [glowOpacity],
  );

  return { glowOpacity, pulse };
}
