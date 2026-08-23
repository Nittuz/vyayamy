/**
 * useReduceMotion — the OS "Reduce Motion" setting, read live.
 *
 * Every animated primitive used to duplicate a "read once on mount" block
 * (Sheet, Plate, ActiveSetCard, VoiceMicButton, FadeInView, SettleSlam,
 * ToastContext, SyncErrorStripe, SessionVolumeBar) — so a Settings >
 * Accessibility > Motion toggle flipped mid-session never took effect until
 * the next cold start. This hook is the one place that reads
 * `AccessibilityInfo.isReduceMotionEnabled()` and subscribes to
 * `reduceMotionChanged`, cleaning the subscription up on unmount, so a live
 * toggle now reaches every consumer immediately.
 *
 * The resolved value is cached at module scope across hook instances: once
 * ANY consumer app-wide has resolved the initial async read, every later
 * mount — including a card that remounts on every logged set — seeds its
 * state with that known value instead of guessing `false` for a frame.
 * (Impeccable r2 #I3.)
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let lastKnown: boolean | null = null;

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(lastKnown ?? false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        lastKnown = r;
        if (active) setReduceMotion(r);
      })
      .catch(() => {
        // Default: motion allowed. Deliberately overwrites a stale cached
        // `true` too — an unreadable OS setting is indistinguishable from
        // "off" as far as this hook is concerned.
        lastKnown = false;
        if (active) setReduceMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => {
      lastKnown = r;
      if (active) setReduceMotion(r);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
