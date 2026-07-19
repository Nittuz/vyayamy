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
import { addSet, type FirstSetStage, stageFirstSet } from '@/queries/sets';
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
  userId,
  units,
  weightStep,
}: {
  exercises: ExerciseShape[];
  refreshDetail: () => void;
  userId: string | undefined;
  units: 'kg' | 'lb';
  weightStep: number;
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
  // Seeded-set markers keyed by set id (#12 nag suppression + LAST TIME).
  // A workout can hold several untouched seeds at once (one per prefilled
  // exercise), so a scalar marker mis-attributes them. Bounded by the
  // workout's set count; stale completed-set entries are inert (completed
  // sets never reach the confirm path or the LAST TIME lookup).
  const stagedSeeds = useRef<Map<string, AutoStagedSet>>(new Map());
  const [stagedMarkers, setStagedMarkers] = useState<ReadonlyMap<string, AutoStagedSet>>(new Map());

  const remember = useCallback((marker: AutoStagedSet) => {
    stagedSeeds.current.set(marker.id, marker);
    setStagedMarkers(new Map(stagedSeeds.current));
  }, []);

  // Single owner of the staged-set markers (#12 nag suppression + LAST TIME
  // provenance). The ref feeds synchronous callback logic; the state mirror
  // feeds render (never read the ref during render).
  const markStaged = useCallback(
    (staged: FirstSetStage) => {
      remember({
        id: staged.setId,
        weight: staged.plan.weight,
        reps: staged.plan.reps,
        source: staged.fromHistory ? 'history' : 'carry',
      });
    },
    [remember],
  );

  const markCarried = useCallback(
    (marker: AutoStagedSet) => {
      remember({ ...marker, source: 'carry' });
    },
    [remember],
  );

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

  const onNextExercise = useCallback(
    (flushed?: { weight: number | null; reps: number | null } | null) => {
      if (!cursor || !currentExercise) return;
      const nextEx = findNextExercise(exercises, cursor.weId);
      // Overlay the just-flushed keypad values — the cached set may lag an edit
      // committed milliseconds ago (flush-before-consume, spec §3).
      const rawSet = findSet(currentExercise, cursor.setId);
      const currentSet = rawSet && flushed ? { ...rawSet, ...flushed } : rawSet;
      // Only warn when leaving a set the user actually entered. The untouched
      // auto-staged set (and the empty first set) carry no intent (#12).
      const needsConfirm = shouldConfirmLeavingSet(
        currentSet,
        currentSet ? (stagedSeeds.current.get(currentSet.id) ?? null) : null,
      );
      const advance = async () => {
        if (nextEx) {
          // Target the next exercise's first INCOMPLETE set — not sets[0], which
          // may already be completed (prior session / earlier logging). Landing
          // the cursor on a completed set makes the cursor-reset effect bounce it
          // back to the first incomplete set (an earlier exercise). Stage a fresh
          // set only if every set in the next exercise is already done.
          let nextSetId = firstIncompleteSet(nextEx)?.id;
          if (!nextSetId) {
            if (userId) {
              // First set of this exercise → never-empty prefill (spec §2).
              const staged = await stageFirstSet(nextEx.id, nextEx.exerciseId, {
                userId,
                units,
                weightStep,
              });
              nextSetId = staged.setId;
              markStaged(staged);
            } else {
              nextSetId = await addSet(nextEx.id);
            }
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
    },
    [cursor, currentExercise, exercises, refreshDetail, userId, units, weightStep, markStaged],
  );

  const onPrevExercise = useCallback(
    (flushed?: { weight: number | null; reps: number | null } | null) => {
      if (!cursor || !currentExercise) return;
      const prevEx = findPrevExercise(exercises, cursor.weId);
      if (!prevEx) return;
      // Same guard as next-exercise (#12 asymmetry): leaving a set the user
      // actually entered warns in BOTH directions, not just forward.
      const rawSet = findSet(currentExercise, cursor.setId);
      const currentSet = rawSet && flushed ? { ...rawSet, ...flushed } : rawSet;
      const needsConfirm = shouldConfirmLeavingSet(
        currentSet,
        currentSet ? (stagedSeeds.current.get(currentSet.id) ?? null) : null,
      );
      // Mirror next-exercise: target prev's first INCOMPLETE set (not sets[0], which
      // may be completed and would make the cursor-reset effect bounce away, #13).
      const goBack = async () => {
        let setId = firstIncompleteSet(prevEx)?.id;
        if (!setId) {
          if (userId) {
            // First set of this exercise → never-empty prefill (spec §2).
            const staged = await stageFirstSet(prevEx.id, prevEx.exerciseId, {
              userId,
              units,
              weightStep,
            });
            setId = staged.setId;
            markStaged(staged);
          } else {
            setId = await addSet(prevEx.id);
          }
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
    },
    [cursor, currentExercise, exercises, refreshDetail, userId, units, weightStep, markStaged],
  );

  return {
    cursor,
    setCursor,
    currentExercise,
    stagedMarkers,
    markStaged,
    markCarried,
    targetExercise,
    onNextExercise,
    onPrevExercise,
    leaveConfirm,
    setLeaveConfirm,
  };
}
