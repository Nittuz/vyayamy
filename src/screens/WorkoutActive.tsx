import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ActiveSetCard } from '@/components/ActiveSetCard';
import {
  type ActiveCursor,
  completedSetsBeforeCursor,
  type ExerciseShape,
  findExercise,
  findInitialCursor,
  findNextExercise,
  findPrevExercise,
  findSet,
  firstIncompleteSet,
} from '@/components/activeSet';
import { EditableTitle } from '@/components/EditableTitle';
import { ExercisePicker } from '@/components/ExercisePicker';
import { RestOverrideSheet } from '@/components/RestOverrideSheet';
import { RestProgressBar } from '@/components/RestProgressBar';
import { SessionVolumeBar } from '@/components/SessionVolumeBar';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { VoiceMicButton } from '@/components/VoiceMicButton';
import { useVoiceSession } from '@/voice/useVoiceSession';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useProfile } from '@/queries/profile';
import { queryKeys } from '@/queries/keys';
import { addSet, useUpdateSet } from '@/queries/sets';
import {
  deleteWorkoutLocal,
  useActiveWorkout,
  useFinishWorkout,
  useUpdateWorkoutTitle,
} from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { DEFAULT_UNITS, sumVolume } from '@/core/units';
import { dayOfWeek } from '@/lib/dayOfWeek';
import { haptics } from '@/ui/haptics';
import { useRestTimer } from '@/ui/hooks/useRestTimer';
import { effectiveRest, getOverrides } from '@/ui/restOverrides';
import { SessionRecap } from '@/ui/SessionRecap';
import { SyncIndicator } from '@/ui/SyncIndicator';
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
    () => effectiveRest(overrides, currentExForRest?.exerciseId ?? '', currentExForRest?.muscleGroup ?? null),
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

  // Initialize cursor when exercises first load, or reposition when the cursor
  // points at a set that no longer exists / is already completed. cursor is read
  // here only to check validity — the setter is always called conditionally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (exercises.length === 0) {
      setCursor(null);
      didInitCursor.current = false;
      return;
    }
    // Add-from-recap: target the just-added exercise's staged set once it loads.
    if (pendingTargetWeId.current) {
      const target = findExercise(exercises, pendingTargetWeId.current);
      if (target) {
        const set = firstIncompleteSet(target);
        if (set) {
          pendingTargetWeId.current = null;
          didInitCursor.current = true;
          setCursor({ weId: target.id, setId: set.id });
        }
      }
      return; // exercise not in the cached data yet → wait for the next render
    }
    if (cursor) {
      didInitCursor.current = true; // we have a real cursor → initialized
      const ex = findExercise(exercises, cursor.weId);
      if (ex) {
        const set = findSet(ex, cursor.setId);
        // Set not in the cached data yet — it was just created (advancing to a
        // new exercise stages a set before the query refetch lands). Keep the
        // cursor; the data will catch up.
        if (!set) return;
        if (!set.completed) return; // valid working set
        // set exists and is completed → fall through and reposition
      }
      // cursor points at a missing exercise or a completed set → reposition
      setCursor(findInitialCursor(exercises));
      return;
    }
    // cursor is null: initialize on first load. Once the user has finished
    // (deliberate null via "finish →"), leave it null so the recap shows and we
    // don't bounce them back into the first incomplete set.
    if (!didInitCursor.current) {
      didInitCursor.current = true;
      setCursor(findInitialCursor(exercises));
    }
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
      const newSetId = await addSet(cursor.weId, {
        weight: currentSetData?.weight ?? null,
        reps: currentSetData?.reps ?? null,
        // Same session → same logging unit as the set just completed.
        units: currentSetData?.weight != null ? units : null,
      });
      refreshDetail();
      setCursor({ weId: cursor.weId, setId: newSetId });
    } finally {
      completingRef.current = false;
    }
  }, [cursor, currentExForRest, updateSet, timer, refreshDetail, units]);

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
    const isUnmodified = !currentSet || (currentSet.weight == null && currentSet.reps == null);
    const advance = async () => {
      if (nextEx) {
        // Target the next exercise's first INCOMPLETE set — not sets[0], which
        // may already be completed (prior session / earlier logging). Landing
        // the cursor on a completed set makes the cursor-reset effect bounce it
        // back to the first incomplete set (an earlier exercise). Stage a fresh
        // set only if every set in the next exercise is already done.
        let nextSetId = nextEx.sets.find((s) => !s.completed)?.id;
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
    if (isUnmodified) {
      void advance();
    } else {
      Alert.alert('Skip this set?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: () => void advance() },
      ]);
    }
  }, [cursor, currentExForRest, exercises, refreshDetail]);

  const onPrevExercise = useCallback(() => {
    if (!cursor) return;
    const prevEx = findPrevExercise(exercises, cursor.weId);
    if (!prevEx) return;
    // Mirror next-exercise: target prev's first INCOMPLETE set (not sets[0], which
    // may be completed and would make the cursor-reset effect bounce away, #13).
    void (async () => {
      let setId = firstIncompleteSet(prevEx)?.id;
      if (!setId) {
        setId = await addSet(prevEx.id);
        refreshDetail();
      }
      setCursor({ weId: prevEx.id, setId });
      haptics.medium();
    })();
  }, [cursor, exercises, refreshDetail]);

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
    onStartRest: () => timer.start(),
    onNextExercise,
    onPrevExercise,
    onFinishWorkout: () => setCursor(null),
    onCompleteSet: () => void onComplete(),
  });

  const hasNextExercise = currentExForRest ? findNextExercise(exercises, currentExForRest.id) !== null : false;
  const nextLabel = hasNextExercise ? 'next →' : 'finish →';

  const screenOptions = useMemo(
    () => ({
      headerTitle: () => (
        <EditableTitle
          value={(activeQuery.data?.title || dayOfWeek(new Date())).toString()}
          onCommit={(next) => {
            if (activeQuery.data) {
              updateTitle.mutate({ workoutId: activeQuery.data.id, title: next });
            }
          }}
        />
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {cursor ? (
            <Pressable
              onPress={onNextExercise}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={hasNextExercise ? 'Next exercise' : 'Finish workout'}
              accessibilityHint={hasNextExercise ? 'Move to the next exercise' : 'Complete the workout'}
            >
              <Text
                style={{
                  color: theme.color.accent,
                  fontFamily: theme.font.family.sansMedium,
                  fontSize: 13,
                }}
              >
                {nextLabel}
              </Text>
            </Pressable>
          ) : null}
          <SyncIndicator />
        </View>
      ),
    }),
    [activeQuery.data, cursor, hasNextExercise, nextLabel, onNextExercise, theme, updateTitle],
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
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <Text style={[styles.empty, { color: theme.color.inkSecondary }]}>No active workout.</Text>
        <Pressable
          onPress={() => router.replace('/today')}
          style={styles.linkButton}
          accessibilityRole="link"
          accessibilityLabel="Back to today"
        >
          <Text style={[styles.linkText, { color: theme.color.accent }]}>Back to Today</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // No exercises yet
  if (exercises.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.center, { flex: 1, gap: theme.space.s4 }]}>
          <Text style={[styles.empty, { color: theme.color.inkSecondary }]}>
            Add your first exercise to begin.
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add your first exercise"
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: theme.color.onAccent }]}>
              + Add exercise
            </Text>
          </Pressable>
          {/* Escape hatch: an exercise-less workout could otherwise be neither
              finished nor discarded, stranding the user (#18). */}
          <Pressable
            onPress={() =>
              Alert.alert('Discard workout?', 'This empty workout will be removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => void onDiscardEmpty() },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel="Discard workout"
            style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.linkText, { color: theme.color.inkSecondary }]}>Discard workout</Text>
          </Pressable>
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

  // Cursor is null → all exercises complete → show Finish summary
  if (!cursor) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.center, { flex: 1, gap: theme.space.s4, paddingHorizontal: 20 }]}>
          <Text
            style={[
              styles.finishTitle,
              { color: theme.color.inkHero, fontFamily: theme.font.family.sansSemibold },
            ]}
          >
            Workout complete.
          </Text>
          <SessionRecap
            volume={totalVolume(exercises, units)}
            setCount={totalSetsCompleted(exercises)}
            durationMs={
              activeQuery.data.started_at
                ? Date.now() - new Date(activeQuery.data.started_at).getTime()
                : 0
            }
            units={units}
          />
          <Pressable
            onPress={onFinish}
            disabled={finishWorkout.isPending}
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            accessibilityState={{ disabled: finishWorkout.isPending, busy: finishWorkout.isPending }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {finishWorkout.isPending ? (
              <ActivityIndicator color={theme.color.onAccent} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: theme.color.onAccent }]}>
                → Finish workout
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add exercise to workout"
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>
              + Add exercise
            </Text>
          </Pressable>
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
      <SessionVolumeBar volume={totalVolume(exercises, units)} units={units} />
      <ScrollView contentContainerStyle={styles.scroll}>
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
          voice={{
            phase: voice.ui.phase,
            partial: voice.ui.phase === 'listening' ? voice.ui.partial : undefined,
            feedback:
              voice.ui.phase === 'pending' || voice.ui.phase === 'applied' ? voice.ui.label : undefined,
          }}
        />
        <View style={{ marginTop: theme.space.s4, gap: theme.space.s3 }}>
          <VoiceMicButton
            phase={!voice.available ? 'disabled' : voice.ui.phase === 'idle' ? 'idle' : 'listening'}
            onTap={() => (voice.ui.phase === 'idle' ? void voice.start() : voice.stop())}
            onHoldStart={() => void voice.start()}
            onHoldEnd={() => voice.stop()}
          />
          {voice.ui.phase === 'pending' ? (
            <Pressable
              onPress={() => void voice.confirmPending()}
              accessibilityRole="button"
              accessibilityLabel="Confirm voice command"
              style={({ pressed }) => [styles.addExercise, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: theme.color.accent, fontFamily: theme.font.family.sansMedium, fontSize: 13 }}>
                Confirm
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add exercise to workout"
          style={({ pressed }) => [styles.addExercise, { opacity: pressed ? 0.7 : 1, marginTop: theme.space.s4 }]}
        >
          <Text
            style={{
              color: theme.color.accent,
              fontFamily: theme.font.family.sansMedium,
              fontSize: theme.font.size.body,
            }}
          >
            + Add exercise
          </Text>
        </Pressable>
      </ScrollView>
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
  scroll: { paddingBottom: 64 },
  empty: { fontSize: 14, lineHeight: 20 },
  linkButton: { padding: 12 },
  linkText: { fontSize: 14 },
  primaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '500' },
  addExercise: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  finishTitle: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  finishBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
