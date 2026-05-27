/**
 * Wrapped expo-haptics calls.
 * All swallow errors so callers can `void haptics.light()` safely.
 *
 * Trigger map (Phase 1 spec):
 *   - light:   stepper increment, routine set completion, skip-rest long-press
 *   - medium:  last set of exercise completion
 *   - rigid:   swipe-up crosses completion threshold
 *   - success: rest timer reaches target
 */
import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<unknown>) => {
  fn().catch(() => {
    /* haptics unavailable — swallow */
  });
};

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  rigid: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
