import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type ActiveCursor,
  type AutoStagedSet,
  type ExerciseShape,
  findExercise,
  findNextExercise,
  findPrevExercise,
  findSet,
  firstIncompleteSet,
  resolveCursor,
  shouldConfirmLeavingSet,
} from '@/components/activeSet';
import { addSet } from '@/queries/sets';
import { haptics } from '@/ui/haptics';

/**
 * The active-workout cursor: which set is "under the pen", plus the
 * next/previous-exercise moves and the leave-confirm guard around them.
 * The positioning decisions themselves live in resolveCursor and the other
 * pure helpers in components/activeSet.ts (characterization-tested).
 */
export function useWorkoutCursor({
  exercises,
  refreshDetail,
}: {
  exercises: ExerciseShape[];
  refreshDetail: () => void;
}) {
  const [cursor, setCursor] = useState<ActiveCursor | null>(null);

  // Confirm decisions go through the themed ConfirmSheet, never OS Alert.
  const [leaveConfirm, setLeaveConfirm] = useState<null | (() => void)>(null);

  // Tracks whether the cursor has been initialized for the current workout.
  // Distinguishes "cursor is null because we haven't loaded yet" (→ initialize)
  // from "cursor is null because the user finished" (→ leave it, show the recap).
  const didInitCursor = useRef(false);
  // When adding an exercise from the recap, drop the cursor onto THAT exercise's
  // staged set once its data arrives — not the first incomplete set anywhere (#13).
  const pendingTargetWeId = useRef<string | null>(null);
  // The next set auto-staged on completion is pre-filled with the prior set's
  // weight × reps, so "has values" can't tell it apart from a set the user
  // entered. Remember its identity + pre-filled values so leaving an untouched
  // staged set doesn't trigger the "Skip this set?" prompt every time (#12).
  const autoStaged = useRef<AutoStagedSet | null>(null);

  // Initialize cursor when exercises first load, or reposition when the cursor
  // points at a set that no longer exists / is already completed. The decision
  // lives in resolveCursor (pure, characterization-tested, #21/#77); this
  // effect only applies its outcome. cursor is read only to check validity —
  // the setter is called only when the resolution carries a cursor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const res = resolveCursor(exercises, cursor, didInitCursor.current, pendingTargetWeId.current);
    didInitCursor.current = res.didInit;
    pendingTargetWeId.current = res.pendingTargetWeId;
    if (res.cursor !== undefined) setCursor(res.cursor);
  }, [exercises, cursor]);

  const currentExercise = cursor ? findExercise(exercises, cursor.weId) : null;

  // Land the cursor on a specific exercise's (auto-staged) set once its data
  // arrives — used when adding an exercise, not the first incomplete set (#13).
  const targetExercise = useCallback((weId: string) => {
    pendingTargetWeId.current = weId;
    didInitCursor.current = false;
  }, []);

  const onNextExercise = useCallback(() => {
    if (!cursor || !currentExercise) return;
    const nextEx = findNextExercise(exercises, cursor.weId);
    const currentSet = findSet(currentExercise, cursor.setId);
    // Only warn when leaving a set the user actually entered. The untouched
    // auto-staged set (and the empty first set) carry no intent (#12).
    const needsConfirm = shouldConfirmLeavingSet(currentSet, autoStaged.current);
    const advance = async () => {
      if (nextEx) {
        // Target the next exercise's first INCOMPLETE set — not sets[0], which
        // may already be completed (prior session / earlier logging). Landing
        // the cursor on a completed set makes the cursor-reset effect bounce it
        // back to the first incomplete set (an earlier exercise). Stage a fresh
        // set only if every set in the next exercise is already done.
        let nextSetId = firstIncompleteSet(nextEx)?.id;
        if (!nextSetId) {
          nextSetId = await addSet(nextEx.id);
          refreshDetail();
        }
        setCursor({ weId: nextEx.id, setId: nextSetId });
        haptics.medium();
      } else {
        setCursor(null); // → finish summary
        haptics.medium();
      }
    };
    if (!needsConfirm) {
      void advance();
    } else {
      setLeaveConfirm(() => () => void advance());
    }
  }, [cursor, currentExercise, exercises, refreshDetail]);

  const onPrevExercise = useCallback(() => {
    if (!cursor || !currentExercise) return;
    const prevEx = findPrevExercise(exercises, cursor.weId);
    if (!prevEx) return;
    // Same guard as next-exercise (#12 asymmetry): leaving a set the user
    // actually entered warns in BOTH directions, not just forward.
    const currentSet = findSet(currentExercise, cursor.setId);
    const needsConfirm = shouldConfirmLeavingSet(currentSet, autoStaged.current);
    // Mirror next-exercise: target prev's first INCOMPLETE set (not sets[0], which
    // may be completed and would make the cursor-reset effect bounce away, #13).
    const goBack = async () => {
      let setId = firstIncompleteSet(prevEx)?.id;
      if (!setId) {
        setId = await addSet(prevEx.id);
        refreshDetail();
      }
      setCursor({ weId: prevEx.id, setId });
      haptics.medium();
    };
    if (!needsConfirm) {
      void goBack();
    } else {
      setLeaveConfirm(() => () => void goBack());
    }
  }, [cursor, currentExercise, exercises, refreshDetail]);

  return {
    cursor,
    setCursor,
    currentExercise,
    autoStaged,
    targetExercise,
    onNextExercise,
    onPrevExercise,
    leaveConfirm,
    setLeaveConfirm,
  };
}
