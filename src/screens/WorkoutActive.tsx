import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
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
  findSet,
} from '@/components/activeSet';
import { EditableTitle } from '@/components/EditableTitle';
import { ExercisePicker } from '@/components/ExercisePicker';
import { RestOverrideSheet } from '@/components/RestOverrideSheet';
import { RestProgressBar } from '@/components/RestProgressBar';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { VoiceMicButton } from '@/components/VoiceMicButton';
import { useVoiceSession } from '@/voice/useVoiceSession';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { addSet, useUpdateSet } from '@/queries/sets';
import { useActiveWorkout, useFinishWorkout, useUpdateWorkoutTitle } from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { dayOfWeek } from '@/lib/dayOfWeek';
import { haptics } from '@/ui/haptics';
import { useRestTimer } from '@/ui/hooks/useRestTimer';
import { motion as motionTokens } from '@/ui/motion';
import { effectiveRest, getOverrides } from '@/ui/restOverrides';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useSyncAwareErrorToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

const AnimatedText = Animated.createAnimatedComponent(Text);

function AnimatedCounter({
  toValue,
  suffix,
  style,
}: {
  toValue: number;
  suffix?: string;
  style: any; // AnimatedText style prop is loosely typed in Reanimated 4
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(toValue, {
      duration: motionTokens.duration.counter,
      easing: Easing.out(Easing.cubic),
    });
  }, [toValue, v]);
  const props = useAnimatedProps(() => ({
    text: `${Math.round(v.value)}${suffix ?? ''}`,
  })) as any;
  return <AnimatedText style={style} animatedProps={props} />;
}

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const syncAwareError = useSyncAwareErrorToast();
  const toastError = useCallback((msg: string) => syncAwareError(msg), [syncAwareError]);

  const theme = useTheme();
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);

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

  // Initialize cursor when exercises first load, or reposition when external
  // state changes (e.g. new set added). cursor is read here only to check
  // validity — the setter is always called conditionally, so this is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (exercises.length === 0) {
      setCursor(null);
      return;
    }
    if (cursor) {
      const ex = findExercise(exercises, cursor.weId);
      const set = ex ? findSet(ex, cursor.setId) : null;
      if (ex && set && !set.completed) return; // current cursor still valid
    }
    setCursor(findInitialCursor(exercises));
  }, [exercises, cursor]);

  const onChangeWeight = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { weight: next } });
    },
    [cursor, updateSet],
  );

  const onChangeReps = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { reps: next } });
    },
    [cursor, updateSet],
  );

  const onComplete = useCallback(async () => {
    if (!cursor) return;
    // Mark the current set complete
    updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
    timer.start();
    // Auto-stage the next set with the same weight × reps (Phase 3)
    const currentSetData = currentExForRest && findSet(currentExForRest, cursor.setId);
    const newSetId = await addSet(cursor.weId, {
      weight: currentSetData?.weight ?? null,
      reps: currentSetData?.reps ?? null,
    });
    setCursor({ weId: cursor.weId, setId: newSetId });
  }, [cursor, currentExForRest, updateSet, timer]);

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
      await addExercise.mutateAsync({ workoutId: activeQuery.data.id, exerciseId });
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
        // Find or stage first set of next exercise
        let nextSetId = nextEx.sets[0]?.id;
        if (!nextSetId) {
          nextSetId = await addSet(nextEx.id);
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
  }, [cursor, currentExForRest, exercises]);

  const onPrevExercise = useCallback(() => {
    if (!cursor) return;
    const idx = exercises.findIndex((e) => e.id === cursor.weId);
    if (idx <= 0) return;
    const prev = exercises[idx - 1]!;
    const setId = prev.sets[0]?.id;
    if (setId) {
      setCursor({ weId: prev.id, setId });
      haptics.medium();
    }
  }, [cursor, exercises]);

  // Hands-free voice session. Data commands route through the tested dispatch
  // layer; "done" reuses the screen's canonical completion (timer + auto-stage);
  // "finish workout" drops to the existing finish-summary confirm screen.
  const voice = useVoiceSession({
    getDispatchContext: () => ({
      userId: userId ?? '',
      workoutId: activeQuery.data?.id ?? '',
      activeWeId: cursor?.weId ?? null,
      activeSetId: cursor?.setId ?? null,
      units: 'lb',
    }),
    getParserContext: () => ({ units: 'lb', hasActiveExercise: exercises.length > 0 }),
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
          <View style={{ flexDirection: 'row', gap: theme.space.s4 }}>
            <AnimatedCounter
              toValue={totalSetsCompleted(exercises)}
              suffix=" sets"
              style={[
                styles.finishBody,
                { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
              ]}
            />
            <AnimatedCounter
              toValue={totalVolume(exercises)}
              suffix=" lb"
              style={[
                styles.finishBody,
                { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
              ]}
            />
          </View>
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

  const currentEx = findExercise(exercises, cursor.weId)!;
  const currentSet = findSet(currentEx, cursor.setId)!;
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <ActiveSetCard
          key={currentSet.id}
          exercise={currentEx}
          set={currentSet}
          exerciseIndex={currentExIdx + 1}
          totalExercises={exercises.length}
          setIndex={currentSetIdx + 1}
          weightStep={5}
          weightUnit="LB"
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

function totalVolume(exs: ExerciseShape[]): number {
  return exs.reduce(
    (acc, ex) =>
      acc +
      ex.sets.reduce(
        (a2, s) => (s.completed && s.weight != null && s.reps != null ? a2 + s.weight * s.reps : a2),
        0,
      ),
    0,
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
