import { useCallback, useRef, useState } from 'react';

import type { ExerciseShape, SetShape } from '@/components/activeSet';
import type { BankSignal } from '@/components/SessionVolumeBar';
import {
  createSessionPRTracker,
  registerBankedSet,
  useAllTimeHeaviestKg,
  type SessionPRTracker,
} from '@/queries/sessionPRs';

/**
 * Live PR detection (#25): seed a running per-exercise heaviest tracker from
 * the all-time records, then test each banked set against it. The result
 * drives the volume bar's PR pulse + pill and the finish recap.
 */
export function useSessionPRs(userId: string | undefined) {
  const heaviestQuery = useAllTimeHeaviestKg(userId);
  const prTracker = useRef<SessionPRTracker | null>(null);
  const [bankSignal, setBankSignal] = useState<BankSignal>({ nonce: 0, isPR: false });
  const [sessionPRs, setSessionPRs] = useState<string[]>([]);

  /**
   * Did the set just banked beat the all-time heaviest for its exercise?
   * Pulses the volume bar either way; records the exercise name on a PR.
   */
  const registerBank = useCallback(
    (exercise: ExerciseShape | null, setData: SetShape | null, units: 'kg' | 'lb'): boolean => {
      if (prTracker.current == null) {
        prTracker.current = createSessionPRTracker(heaviestQuery.data ?? {});
      }
      const isPR =
        exercise != null &&
        registerBankedSet(prTracker.current, {
          exerciseId: exercise.exerciseId,
          weight: setData ? setData.weight : null,
          units: setData?.units ?? units,
        });
      setBankSignal((s) => ({ nonce: s.nonce + 1, isPR }));
      if (isPR && exercise) {
        const name = exercise.exerciseName;
        setSessionPRs((prev) => (prev.includes(name) ? prev : [...prev, name]));
      }
      return isPR;
    },
    [heaviestQuery.data],
  );

  return { bankSignal, sessionPRs, registerBank };
}
