/**
 * Rest timer between sets.
 *
 * Counts up from 0 in real time, fires an optional haptic at the
 * configured target, and schedules a local notification so the user is
 * alerted even if the app is backgrounded or the screen is locked.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cancelRest, scheduleRestDone } from '@/lib/restNotifications';

interface UseRestTimerArgs {
  targetSeconds?: number;
}

export function useRestTimer(args: UseRestTimerArgs = {}) {
  const { targetSeconds = 90 } = args;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const firedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    intervalRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(secs);
      if (!firedRef.current && secs >= targetSeconds) {
        firedRef.current = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 250);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [startedAt, targetSeconds]);

  const start = useCallback(() => {
    firedRef.current = false;
    setElapsed(0);
    setStartedAt(Date.now());
    void cancelRest(notificationIdRef.current).then(() => {
      notificationIdRef.current = null;
      return scheduleRestDone(targetSeconds);
    }).then((id) => {
      notificationIdRef.current = id;
    });
  }, [targetSeconds]);

  const stop = useCallback(() => {
    setStartedAt(null);
    setElapsed(0);
    firedRef.current = false;
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
    targetSeconds,
    start,
    stop,
  };
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
