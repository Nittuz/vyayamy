/**
 * Rest timer between sets.
 *
 * Counts up from 0 in real time, fires an optional haptic at the
 * configured target, and schedules a local notification so the user is
 * alerted even if the app is backgrounded or the screen is locked.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getKv, registerUserScopedKv, removeKv, setKv } from '@/lib/kvStore';

import { cancelRest, primeRestAlerts, scheduleRestDone } from './notifications';
import {
  PersistedTimer,
  REST_TIMER_KEY,
  REST_TIMER_SCHEMA_VERSION,
  shouldRestoreTimer,
} from './timerPolicy';

// The live rest timer is per-user — wiped on sign-out via the registry (#36).
registerUserScopedKv(REST_TIMER_KEY);

interface UseRestTimerArgs {
  targetSeconds?: number;
}

export function useRestTimer(args: UseRestTimerArgs = {}) {
  const { targetSeconds = 90 } = args;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // The target actually in effect — equals the prop unless a spoken duration or a
  // restored timer overrode it (#105/#17). Kept in sync with the prop while idle.
  const [activeTarget, setActiveTarget] = useState(targetSeconds);
  const firedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationIdRef = useRef<string | null>(null);

  const hydratedRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      const persisted = await getKv<PersistedTimer>(REST_TIMER_KEY, REST_TIMER_SCHEMA_VERSION);
      const decision = shouldRestoreTimer(persisted, Date.now());
      if (decision.clearStale) {
        void removeKv(REST_TIMER_KEY);
      }
      if (decision.restore && persisted) {
        // Resume the timer from where it was, re-adopt the persisted target, and
        // re-adopt the scheduled notification id so stop() can still cancel it
        // after a remount (#17/#160).
        setStartedAt(persisted.startedAt);
        setActiveTarget(persisted.targetSeconds);
        notificationIdRef.current = persisted.notificationId ?? null;
      }
    })();
  }, []);

  // Keep the active target aligned with the prop while idle (the prop changes as
  // the cursor moves to an exercise with a different configured rest).
  useEffect(() => {
    if (startedAt == null) setActiveTarget(targetSeconds);
  }, [targetSeconds, startedAt]);

  useEffect(() => {
    if (startedAt == null) return;
    intervalRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(secs);
      if (!firedRef.current && secs >= activeTarget) {
        firedRef.current = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 250);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [startedAt, activeTarget]);

  const start = useCallback(
    (secondsOverride?: number) => {
      firedRef.current = false;
      setElapsed(0);
      const now = Date.now();
      // A spoken "rest two minutes" overrides the exercise's configured rest (#105).
      const target = secondsOverride != null && secondsOverride > 0 ? secondsOverride : targetSeconds;
      setActiveTarget(target);
      setStartedAt(now);
      void setKv<PersistedTimer>(REST_TIMER_KEY, {
        schemaVersion: REST_TIMER_SCHEMA_VERSION,
        startedAt: now,
        targetSeconds: target,
        notificationId: null,
      });
      void cancelRest(notificationIdRef.current)
        .then(() => {
          notificationIdRef.current = null;
          // Prime here — the first rest of a workout is a deliberate, contextual
          // moment to ask, and iOS only shows the dialog once (#157).
          return primeRestAlerts();
        })
        .then(() => scheduleRestDone(target))
        .then((id) => {
          notificationIdRef.current = id;
          // Persist the id so a restored timer can cancel the right notification.
          void setKv<PersistedTimer>(REST_TIMER_KEY, {
            schemaVersion: REST_TIMER_SCHEMA_VERSION,
            startedAt: now,
            targetSeconds: target,
            notificationId: id,
          });
      });
  }, [targetSeconds]);

  const stop = useCallback(() => {
    setStartedAt(null);
    setElapsed(0);
    firedRef.current = false;
    void removeKv(REST_TIMER_KEY);
    void cancelRest(notificationIdRef.current);
    notificationIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (notificationIdRef.current) {
        void cancelRest(notificationIdRef.current);
        notificationIdRef.current = null;
      }
    };
  }, []);

  return {
    running: startedAt != null,
    elapsed,
    targetSeconds: activeTarget,
    start,
    stop,
  };
}
