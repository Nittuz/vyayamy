import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { ActiveSetCard } from '@/components/ActiveSetCard';
import {
  advanceCursor,
  type ActiveCursor,
  completedSetsBeforeCursor,
  type ExerciseShape,
  findExercise,
  findInitialCursor,
  findSet,
} from '@/components/activeSet';
import { ExercisePicker } from '@/components/ExercisePicker';
import { RestProgressBar } from '@/components/RestProgressBar';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useAddSet, useUpdateSet } from '@/queries/sets';
import { useActiveWorkout, useFinishWorkout } from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { useRestTimer } from '@/ui/hooks/useRestTimer';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);

  const addExercise = useAddExerciseToWorkout(toastError);
  const addSet = useAddSet(toastError);
  const updateSet = useUpdateSet(toastError);
  const finishWorkout = useFinishWorkout(userId, toastError);

  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRestTimer({ targetSeconds: 90 });
  const [cursor, setCursor] = useState<ActiveCursor | null>(null);

  // Map query data into the ExerciseShape used by the state machine
  const exercises: ExerciseShape[] = useMemo(() => {
    if (!detail.data) return [];
    return detail.data.exercises.map((we) => ({
      id: we.id,
      exerciseId: we.exercise_id,
      exerciseName: we.exercise?.name ?? 'Unknown exercise',
      orderIndex: we.order_index,
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
    updateSet.mutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
    timer.start();
    const next = advanceCursor(exercises, cursor);
    if (next === null) {
      // Workout done — keep user on screen with a Finish CTA (no auto-finish)
      setCursor(null);
    } else {
      setCursor(next);
    }
  }, [cursor, exercises, updateSet, timer]);

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

  const onAddSet = useCallback(async () => {
    if (!cursor) return;
    await addSet.mutateAsync({ weId: cursor.weId });
  }, [cursor, addSet]);

  const screenOptions = useMemo(
    () => ({
      title: (activeQuery.data?.title || 'Workout').toLowerCase(),
      headerRight: () => <SyncIndicator />,
    }),
    [activeQuery.data?.title],
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
        <Pressable onPress={() => router.replace('/today')} style={styles.linkButton}>
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
          <Text
            style={[
              styles.finishBody,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            {totalSetsCompleted(exercises)} sets · {totalVolume(exercises)} lb total volume
          </Text>
          <Pressable
            onPress={onFinish}
            disabled={finishWorkout.isPending}
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
  const isLastSetOfExercise = currentSetIdx === currentEx.sets.length - 1;
  const ghostSets = completedSetsBeforeCursor(currentEx, cursor);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <Stack.Screen options={screenOptions} />
      <RestProgressBar
        running={timer.running}
        elapsedSeconds={timer.elapsed}
        targetSeconds={timer.targetSeconds}
        onSkip={timer.stop}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ActiveSetCard
          key={currentSet.id}
          exercise={currentEx}
          set={currentSet}
          exerciseIndex={currentExIdx + 1}
          totalExercises={exercises.length}
          setIndex={currentSetIdx + 1}
          totalSetsInExercise={currentEx.sets.length}
          weightStep={5}
          weightUnit="LB"
          isLastSetOfExercise={isLastSetOfExercise}
          ghostSets={ghostSets}
          onChangeWeight={onChangeWeight}
          onChangeReps={onChangeReps}
          onComplete={onComplete}
        />
        <View style={styles.footerActions}>
          <Pressable
            onPress={onAddSet}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>+ Add set</Text>
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.color.ink }]}>+ Add exercise</Text>
          </Pressable>
        </View>
      </ScrollView>
      <ExercisePicker
        userId={userId}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onAddExercise}
      />
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
  empty: { fontSize: 14 },
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
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 24,
  },
  finishTitle: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  finishBody: {
    fontSize: 14,
    textAlign: 'center',
  },
});
