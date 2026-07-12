import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ActiveSetCard } from '@/components/ActiveSetCard';
import {
  type ActiveCursor,
  type AutoStagedSet,
  completedSetsBeforeCursor,
  type ExerciseShape,
  findExercise,
  findNextExercise,
  findPrevExercise,
  findSet,
  firstIncompleteSet,
  planStagedSet,
  resolveCursor,
  type SetShape,
  shouldConfirmLeavingSet,
  workoutHeaderTitle,
} from '@/components/activeSet';
import { EditableTitle } from '@/components/EditableTitle';
import { EditSetSheet } from '@/components/EditSetSheet';
import { ExercisePicker } from '@/components/ExercisePicker';
import { SessionVolumeBar, type BankSignal } from '@/components/SessionVolumeBar';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { VoiceMicButton } from '@/components/VoiceMicButton';
import { useVoiceSession } from '@/voice/useVoiceSession';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useProfile } from '@/queries/profile';
import { queryKeys } from '@/queries/keys';
import {
  createSessionPRTracker,
  registerBankedSet,
  useAllTimeHeaviestKg,
  type SessionPRTracker,
} from '@/queries/sessionPRs';
import { addSet, useUpdateSet } from '@/queries/sets';
import {
  deleteWorkoutLocal,
  useActiveWorkout,
  useFinishWorkout,
  useUpdateWorkoutTitle,
} from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { DEFAULT_UNITS, sumVolume } from '@/core/units';
import { effectiveRest, getOverrides } from '@/rest/overrides';
import { RestOverrideSheet } from '@/rest/RestOverrideSheet';
import { RestProgressBar } from '@/rest/RestProgressBar';
import { useRestTimer } from '@/rest/useRestTimer';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { haptics } from '@/ui/haptics';
import { SessionRecap } from '@/ui/SessionRecap';
import { SettleSlam } from '@/ui/SettleSlam';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useSyncAwareErrorToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const syncAwareError = useSyncAwareErrorToast();
  const toastError = useCallback((msg: string) => syncAwareError(msg), [syncAwareError]);

  const theme = useTheme();
  const qc = useQueryClient();
  // Direct addSet() calls below bypass the mutation hooks, so they must refresh
  // the composite detail query themselves — otherwise, offline, the staged set
  // never appears and the screen hangs on a spinner (deep-review #11).
  const refreshDetail = useCallback(
    () => void qc.invalidateQueries({ queryKey: queryKeys.workouts.detailRoot }),
    [qc],
  );
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);
  const profileQuery = useProfile(userId);
  const units: 'kg' | 'lb' = profileQuery.data?.units ?? DEFAULT_UNITS;
  const weightUnit = units === 'kg' ? 'KG' : 'LB';
  const weightStep = units === 'kg' ? 2.5 : 5;

  const addExercise = useAddExerciseToWorkout(toastError);
  const updateSet = useUpdateSet(toastError);
  const finishWorkout = useFinishWorkout(userId, toastError);
  const updateTitle = useUpdateWorkoutTitle(toastError);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [cursor, setCursor] = useState<ActiveCursor | null>(null);
  const [overrides, setOverridesState] = useState<Record<string, number>>({});
  const [overrideSheetOpen, setOverrideSheetOpen] = useState(false);

  // Live PR detection (#25): seed a running per-exercise heaviest tracker from
  // the all-time records, then test each banked set against it. The result
  // drives the volume bar's PR pulse + pill and the finish recap.
  const heaviestQuery = useAllTimeHeaviestKg(userId);
  const prTracker = useRef<SessionPRTracker | null>(null);
  const [bankSignal, setBankSignal] = useState<BankSignal>({ nonce: 0, isPR: false });
  const [sessionPRs, setSessionPRs] = useState<string[]>([]);

  // Confirm decisions go through the themed ConfirmSheet, never OS Alert.
  const [leaveConfirm, setLeaveConfirm] = useState<null | (() => void)>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  // Banked-set editing (backlog 1.1): the target survives close so the sheet
  // keeps its content through the exit animation.
  const [editTarget, setEditTarget] = useState<{ set: SetShape; number: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const onEditSet = useCallback((s: SetShape, displayIndex: number) => {
    setEditTarget({ set: s, number: displayIndex });
    setEditOpen(true);
  }, []);

  useEffect(() => {
    void getOverrides().then(setOverridesState);
  }, []);

  const reloadOverrides = useCallback(async () => {
    setOverridesState(await getOverrides());
  }, []);

  // Map query data into the ExerciseShape used by the state machine
  const exercises: ExerciseShape[] = useMemo(() => {
    if (!detail.data) return [];
    return detail.data.exercises.map((we) => ({
      id: we.id,
      exerciseId: we.exercise_id,
      exerciseName: we.exercise?.name ?? 'Unknown exercise',
      orderIndex: we.order_index,
      muscleGroup: we.exercise?.muscle_group ?? null,
      sets: (we.sets ?? []).map((s) => ({
        id: s.id,
        weId: we.id,
        orderIndex: s.order_index,
        weight: s.weight,
        reps: s.reps,
        units: s.units,
        completed: Boolean(s.completed),
      })),
    }));
  }, [detail.data]);

  const currentExForRest = cursor ? findExercise(exercises, cursor.weId) : null;
  const restSeconds = useMemo(
    () =>
      effectiveRest(
        overrides,
        currentExForRest?.exerciseId ?? '',
        currentExForRest?.muscleGroup ?? null,
      ),
    [overrides, currentExForRest?.exerciseId, currentExForRest?.muscleGroup],
  );
  const timer = useRestTimer({ targetSeconds: restSeconds });

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

  const onChangeWeight = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      // Stamp the unit the weight is being logged in (per-set provenance, #131).
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { weight: next, units } });
    },
    [cursor, updateSet, units],
  );

  const onChangeReps = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { reps: next } });
    },
    [cursor, updateSet],
  );

  // Guards against a swipe + voice "done" double-fire racing two completions /
  // two staged sets onto the same cursor (#16).
  const completingRef = useRef(false);
  const onComplete = useCallback(async () => {
    if (!cursor || completingRef.current) return;
    completingRef.current = true;
    try {
      // Mark the current set complete
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
      timer.start();
      // Auto-stage the next set with the same weight × reps (Phase 3)
      const currentSetData = currentExForRest && findSet(currentExForRest, cursor.setId);
      const staged = planStagedSet(currentSetData ?? null, units);

      // Did the set just banked beat the all-time heaviest for this exercise?
      if (prTracker.current == null) {
        prTracker.current = createSessionPRTracker(heaviestQuery.data ?? {});
      }
      const isPR =
        currentExForRest != null &&
        registerBankedSet(prTracker.current, {
          exerciseId: currentExForRest.exerciseId,
          weight: currentSetData ? currentSetData.weight : null,
          units: currentSetData?.units ?? units,
        });
      setBankSignal((s) => ({ nonce: s.nonce + 1, isPR }));
      if (isPR && currentExForRest) {
        const name = currentExForRest.exerciseName;
        setSessionPRs((prev) => (prev.includes(name) ? prev : [...prev, name]));
      }

      const newSetId = await addSet(cursor.weId, staged);
      // Record what we pre-filled so an untouched staged set advances silently.
      autoStaged.current = { id: newSetId, weight: staged.weight, reps: staged.reps };
      refreshDetail();
      setCursor({ weId: cursor.weId, setId: newSetId });
    } finally {
      completingRef.current = false;
    }
  }, [cursor, currentExForRest, updateSet, timer, refreshDetail, units, heaviestQuery.data]);

  const onDiscardEmpty = useCallback(async () => {
    if (!activeQuery.data) return;
    await deleteWorkoutLocal(activeQuery.data.id);
    void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    router.replace('/today');
  }, [activeQuery.data, qc]);

  const onFinish = useCallback(async () => {
    if (!activeQuery.data) return;
    await finishWorkout.mutateAsync(activeQuery.data.id);
    timer.stop();
    router.replace('/today');
  }, [activeQuery.data, finishWorkout, timer]);

  const onAddExercise = useCallback(
    async (exerciseId: string) => {
      if (!activeQuery.data) return;
      setPickerOpen(false);
      const weId = await addExercise.mutateAsync({ workoutId: activeQuery.data.id, exerciseId });
      // Land the cursor on the new exercise (its auto-staged set), not the first
      // incomplete set in the workout (#13). The init effect picks this up once
      // the new exercise appears in the cached data.
      pendingTargetWeId.current = weId;
      didInitCursor.current = false;
    },
    [activeQuery.data, addExercise],
  );

  const onNextExercise = useCallback(() => {
    if (!cursor || !currentExForRest) return;
    const nextEx = findNextExercise(exercises, cursor.weId);
    const currentSet = findSet(currentExForRest, cursor.setId);
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
  }, [cursor, currentExForRest, exercises, refreshDetail]);

  const onPrevExercise = useCallback(() => {
    if (!cursor || !currentExForRest) return;
    const prevEx = findPrevExercise(exercises, cursor.weId);
    if (!prevEx) return;
    // Same guard as next-exercise (#12 asymmetry): leaving a set the user
    // actually entered warns in BOTH directions, not just forward.
    const currentSet = findSet(currentExForRest, cursor.setId);
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
  }, [cursor, currentExForRest, exercises, refreshDetail]);

  // Hands-free voice session. Data commands route through the tested dispatch
  // layer; "done" reuses the screen's canonical completion (timer + auto-stage);
  // "finish workout" drops to the existing finish-summary confirm screen.
  const voice = useVoiceSession({
    getDispatchContext: () => ({
      userId: userId ?? '',
      workoutId: activeQuery.data?.id ?? '',
      activeWeId: cursor?.weId ?? null,
      activeSetId: cursor?.setId ?? null,
      units,
    }),
    getParserContext: () => ({ units, hasActiveExercise: exercises.length > 0 }),
    onStartRest: (seconds) => timer.start(seconds), // honor a spoken duration (#105)
    onStopRest: () => timer.stop(),
    onNextExercise,
    onPrevExercise,
    onFinishWorkout: () => setCursor(null),
    onCompleteSet: () => void onComplete(),
  });

  const hasNextExercise = currentExForRest
    ? findNextExercise(exercises, currentExForRest.id) !== null
    : false;

  const screenOptions = useMemo(
    () => ({
      headerTitle: () => (
        <EditableTitle
          // Fallback is the day the workout STARTED, never "today" (1.7/#156).
          value={workoutHeaderTitle(activeQuery.data?.title, activeQuery.data?.started_at)}
          onCommit={(next) => {
            if (activeQuery.data) {
              updateTitle.mutate({ workoutId: activeQuery.data.id, title: next });
            }
          }}
        />
      ),
      // The next/finish control lives in the bottom action row now, in the thumb
      // zone — not stranded in the top-right header (#1.5).
      headerRight: () => <SyncIndicator />,
    }),
    [activeQuery.data, updateTitle],
  );

  if (!userId) return null;

  if (activeQuery.isLoading || detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  if (!activeQuery.data || !detail.data) {
    // Composed empty state (Blacktop spec): mark + one display line + one CTA —
    // never copy floating in a void.
    return (
      <SafeAreaView
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.color.bg, paddingHorizontal: theme.space.page },
        ]}
      >
        <EmptyState
          title="No active workout."
          cta={{
            label: 'Back to Today',
            kind: 'secondary',
            onPress: () => router.replace('/today'),
          }}
        />
      </SafeAreaView>
    );
  }

  // No exercises yet
  if (exercises.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View
          style={[
            styles.center,
            { flex: 1, gap: theme.space.s4, paddingHorizontal: theme.space.page },
          ]}
        >
          <EmptyState
            title="No exercises yet."
            hint="Add your first exercise to begin."
            cta={{
              label: 'Add exercise',
              kind: 'secondary',
              icon: 'plus',
              onPress: () => setPickerOpen(true),
              accessibilityLabel: 'Add your first exercise',
            }}
          />
          {/* Escape hatch (ghost secondary): an exercise-less workout could
              otherwise be neither finished nor discarded, stranding the user (#18). */}
          <Button
            label="Discard workout"
            kind="ghost"
            size="row"
            onPress={() => setDiscardConfirm(true)}
            accessibilityLabel="Discard workout"
          />
        </View>
        <ConfirmSheet
          visible={discardConfirm}
          onClose={() => setDiscardConfirm(false)}
          title="Discard workout?"
          message="This empty workout will be removed."
          confirmLabel="Discard"
          destructive
          onConfirm={() => void onDiscardEmpty()}
        />
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
      </SafeAreaView>
    );
  }

  // Cursor is null → all exercises complete → show Finish summary
  if (!cursor) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View
          style={[
            styles.center,
            { flex: 1, gap: theme.space.s6, paddingHorizontal: theme.space.page },
          ]}
        >
          <SettleSlam>
            <Text variant="display" color={theme.color.inkHero} style={styles.centerText}>
              Workout complete
            </Text>
          </SettleSlam>
          <SessionRecap
            volume={totalVolume(exercises, units)}
            setCount={totalSetsCompleted(exercises)}
            durationMs={
              activeQuery.data.started_at
                ? Date.now() - new Date(activeQuery.data.started_at).getTime()
                : 0
            }
            units={units}
            prs={sessionPRs}
          />
          <View style={styles.finishActions}>
            <Button
              label="Finish workout"
              size="cta"
              loading={finishWorkout.isPending}
              onPress={onFinish}
              accessibilityLabel="Finish workout"
              style={styles.fullBtn}
            />
            <Button
              label="Add exercise"
              kind="secondary"
              size="row"
              icon="plus"
              onPress={() => setPickerOpen(true)}
              accessibilityLabel="Add exercise to workout"
              style={styles.fullBtn}
            />
          </View>
        </View>
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
      </SafeAreaView>
    );
  }

  const currentEx = findExercise(exercises, cursor.weId);
  const currentSet = currentEx ? findSet(currentEx, cursor.setId) : null;
  if (!currentEx || !currentSet) {
    // The cursor briefly points at a set that isn't in the latest data — e.g.
    // just after auto-staging the next set, before the React Query refetch
    // lands. The cursor-reset effect repositions it on the next tick; render a
    // placeholder until then instead of dereferencing null.
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }
  const currentExIdx = exercises.findIndex((e) => e.id === currentEx.id);
  const currentSetIdx = currentEx.sets.findIndex((s) => s.id === currentSet.id);
  const ghostSets = completedSetsBeforeCursor(currentEx, cursor);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <SyncErrorStripe />
      <Stack.Screen options={screenOptions} />
      <RestProgressBar
        running={timer.running}
        elapsedSeconds={timer.elapsed}
        targetSeconds={timer.targetSeconds}
        onSkip={timer.stop}
        onOpenOverride={() => setOverrideSheetOpen(true)}
      />
      <SessionVolumeBar
        volume={totalVolume(exercises, units)}
        units={units}
        bankSignal={bankSignal}
      />
      <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.scroll}>
        <ActiveSetCard
          key={currentSet.id}
          exercise={currentEx}
          set={currentSet}
          exerciseIndex={currentExIdx + 1}
          totalExercises={exercises.length}
          setIndex={currentSetIdx + 1}
          weightStep={weightStep}
          weightUnit={weightUnit}
          ghostSets={ghostSets}
          onChangeWeight={onChangeWeight}
          onChangeReps={onChangeReps}
          onComplete={onComplete}
          onEditSet={onEditSet}
          voice={{
            phase: voice.ui.phase,
            partial: voice.ui.phase === 'listening' ? voice.ui.partial : undefined,
            feedback:
              voice.ui.phase === 'pending' ||
              voice.ui.phase === 'applied' ||
              voice.ui.phase === 'error'
                ? voice.ui.label
                : undefined,
          }}
        />
        <View style={styles.voiceArea}>
          <VoiceMicButton
            phase={!voice.available ? 'disabled' : voice.ui.phase === 'idle' ? 'idle' : 'listening'}
            onTap={() => (voice.ui.phase === 'idle' ? void voice.start() : voice.stop())}
            onHoldStart={() => void voice.start()}
            onHoldEnd={() => voice.stop()}
          />
          {voice.ui.phase === 'pending' ? (
            <Button
              label="Confirm"
              kind="ghost"
              size="row"
              onPress={() => void voice.confirmPending()}
              accessibilityLabel="Confirm voice command"
            />
          ) : null}
        </View>
        <Button
          label="Add exercise"
          kind="ghost"
          size="row"
          icon="plus"
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Add exercise to workout"
        />
      </ScrollView>
      {/* Primary progression control in the thumb zone, not the top header (#1.5).
          Volt is reserved for the finish CTA; mid-workout progression is a panel. */}
      <View style={styles.bottomBar}>
        <Button
          label={hasNextExercise ? 'Next exercise' : 'Finish workout'}
          kind={hasNextExercise ? 'secondary' : 'primary'}
          size="cta"
          icon="arrow-right"
          onPress={onNextExercise}
          accessibilityLabel={hasNextExercise ? 'Next exercise' : 'Finish workout'}
          accessibilityHint={hasNextExercise ? 'Move to the next exercise' : 'Complete the workout'}
        />
      </View>
      <ExercisePicker
        userId={userId}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onAddExercise}
      />
      {currentEx ? (
        <RestOverrideSheet
          visible={overrideSheetOpen}
          exerciseId={currentEx.exerciseId}
          exerciseName={currentEx.exerciseName}
          muscleGroup={currentEx.muscleGroup ?? null}
          currentOverride={overrides[currentEx.exerciseId] ?? null}
          onClose={() => setOverrideSheetOpen(false)}
          onChanged={() => void reloadOverrides()}
        />
      ) : null}
      {editTarget ? (
        <EditSetSheet
          visible={editOpen}
          set={editTarget.set}
          setNumber={editTarget.number}
          exerciseName={currentEx.exerciseName}
          exerciseId={currentEx.exerciseId}
          userId={userId}
          units={units}
          weightStep={weightStep}
          weightUnit={weightUnit}
          onClose={() => setEditOpen(false)}
          onError={toastError}
        />
      ) : null}
      <ConfirmSheet
        visible={!!leaveConfirm}
        onClose={() => setLeaveConfirm(null)}
        title="Leave this set?"
        message="It has values but isn’t completed. Swipe up to log it, or leave it."
        confirmLabel="Leave"
        destructive
        onConfirm={() => leaveConfirm?.()}
      />
    </SafeAreaView>
  );
}

function totalSetsCompleted(exs: ExerciseShape[]): number {
  return exs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0);
}

function totalVolume(exs: ExerciseShape[], displayUnits: 'kg' | 'lb'): number {
  // Convert every completed set into the display unit before summing so a
  // mixed-unit history aggregates honestly (#131/#135).
  return sumVolume(
    exs.flatMap((ex) => ex.sets.filter((s) => s.completed)),
    displayUnits,
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { textAlign: 'center' },
  scrollFlex: { flex: 1 },
  scroll: { paddingBottom: 24 },
  voiceArea: { marginTop: 16, gap: 12 },
  finishActions: { alignSelf: 'stretch', gap: 12 },
  fullBtn: { alignSelf: 'stretch' },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
});
