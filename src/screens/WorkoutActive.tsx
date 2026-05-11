import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { ExerciseBlock } from '@/components/ExerciseBlock';
import { ExercisePicker } from '@/components/ExercisePicker';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useAddSet, useDeleteSet, useUpdateSet } from '@/queries/sets';
import { useActiveWorkout, useFinishWorkout } from '@/queries/workouts';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { formatTimer, useRestTimer } from '@/ui/hooks/useRestTimer';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useToast } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);

  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const addExercise = useAddExerciseToWorkout(toastError);
  const addSet = useAddSet(toastError);
  const updateSet = useUpdateSet(toastError);
  const deleteSet = useDeleteSet(toastError);
  const finishWorkout = useFinishWorkout(userId, toastError);

  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRestTimer({ targetSeconds: 90 });

  const onChangeSet = useCallback(
    (setId: string, patch: { weight?: number | null; reps?: number | null }, weId: string) => {
      updateSet.mutate({ setId, weId, patch });
    },
    [updateSet],
  );

  const onToggleComplete = useCallback(
    (setId: string, completed: boolean, weId: string) => {
      updateSet.mutate({ setId, weId, patch: { completed } });
      if (completed) timer.start();
    },
    [updateSet, timer],
  );

  const onAddSet = useCallback(
    (weId: string) => {
      addSet.mutate({ weId });
    },
    [addSet],
  );

  const onDeleteSet = useCallback(
    (setId: string, weId: string) => {
      deleteSet.mutate({ setId, weId });
    },
    [deleteSet],
  );

  const onFinish = useCallback(async () => {
    if (!activeQuery.data) return;
    await finishWorkout.mutateAsync(activeQuery.data.id);
    timer.stop();
    router.replace('/today');
  }, [activeQuery.data, finishWorkout, timer]);

  const workoutTitle = detail.data?.workout.title ?? '';
  const screenOptions = useMemo(
    () => ({ title: workoutTitle, headerRight: () => <SyncIndicator /> }),
    [workoutTitle],
  );

  if (!userId) return null;

  if (activeQuery.isLoading || detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!activeQuery.data || !detail.data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.empty}>No active workout.</Text>
        <Pressable onPress={() => router.replace('/today')} style={styles.linkButton}>
          <Text style={styles.linkText}>Back to Today</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const workout = detail.data.workout;
  const exercises = detail.data.exercises;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {timer.running ? (
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>Rest</Text>
            <Text
              style={[
                styles.timerValue,
                timer.elapsed >= timer.targetSeconds && styles.timerValueDone,
              ]}
            >
              {formatTimer(timer.elapsed)}
            </Text>
            <Pressable
              onPress={timer.stop}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Skip rest"
              style={styles.timerSkipBtn}
            >
              <Text style={styles.timerSkip}>Skip</Text>
            </Pressable>
          </View>
        ) : null}

        {exercises.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No exercises yet</Text>
            <Text style={styles.emptyBody}>Add your first movement to start logging sets.</Text>
          </View>
        ) : (
          exercises.map((we) => (
            <ExerciseBlock
              key={we.id}
              we={we}
              onChangeSet={(id, patch) => onChangeSet(id, patch, we.id)}
              onToggleComplete={(id, c) => onToggleComplete(id, c, we.id)}
              onAddSet={onAddSet}
              onDeleteSet={(id) => onDeleteSet(id, we.id)}
            />
          ))
        )}

        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.addExercise, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.addExerciseText}>+ Add exercise</Text>
        </Pressable>

        <Pressable
          onPress={onFinish}
          disabled={finishWorkout.isPending}
          style={({ pressed }) => [
            styles.finishButton,
            pressed && { opacity: 0.85 },
            finishWorkout.isPending && { opacity: 0.5 },
          ]}
        >
          {finishWorkout.isPending ? (
            <ActivityIndicator color={theme.color.onAccent} />
          ) : (
            <Text style={styles.finishText}>Finish workout</Text>
          )}
        </Pressable>
      </ScrollView>

      <ExercisePicker
        userId={userId}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={async (exerciseId) => {
          setPickerOpen(false);
          await addExercise.mutateAsync({ workoutId: workout.id, exerciseId });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: theme.space.s3 },
  scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.s4,
    paddingVertical: theme.space.s3,
    gap: theme.space.s3,
  },
  timerLabel: {
    color: theme.color.onAccent,
    opacity: 0.7,
    fontSize: theme.font.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: theme.font.weight.medium,
  },
  timerValue: {
    flex: 1,
    color: theme.color.onAccent,
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  timerValueDone: { color: theme.color.success },
  timerSkipBtn: {
    minHeight: theme.touch.min,
    minWidth: theme.touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerSkip: {
    color: theme.color.onAccent,
    opacity: 0.85,
    fontSize: theme.font.meta,
    fontWeight: theme.font.weight.medium,
  },
  addExercise: {
    padding: theme.space.s4,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  addExerciseText: {
    fontSize: theme.font.body,
    color: theme.color.accentMuted,
    fontWeight: theme.font.weight.medium,
  },
  finishButton: {
    marginTop: theme.space.s4,
    height: theme.touch.cta,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: {
    color: theme.color.onAccent,
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
  },
  empty: { color: theme.color.textSecondary, fontSize: theme.font.body },
  linkButton: { padding: theme.space.s3 },
  linkText: { color: theme.color.accent, fontSize: theme.font.body },
  emptyBlock: {
    padding: theme.space.s8,
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.space.s1,
  },
  emptyTitle: {
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  emptyBody: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
});
