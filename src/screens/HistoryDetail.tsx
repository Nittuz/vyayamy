import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { setRowToShape, type SetShape } from '@/components/activeSet';
import { EditSetSheet } from '@/components/EditSetSheet';
import { formatDuration, formatShortDate, formatTimeOfDay, formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { queryKeys } from '@/queries/keys';
import { useProfile } from '@/queries/profile';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { deleteWorkoutAndRecompute } from '@/queries/workouts';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { Icon } from '@/ui/icons';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useWorkoutDetail(id);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const qc = useQueryClient();

  // Correction path (spec 2026-08-22 §1/§2): set rows open the existing
  // EditSetSheet, and the whole workout can be deleted. userId/units mirror
  // WorkoutActive's destructuring.
  const { user } = useAuth();
  const userId = user?.id;
  const profileQuery = useProfile(userId);
  const units: 'kg' | 'lb' = profileQuery.data?.units ?? DEFAULT_UNITS;
  const weightUnit = units === 'kg' ? 'KG' : 'LB';
  const weightStep = units === 'kg' ? 2.5 : 5;

  // Banked-set editing (mirrors WorkoutActive): editTarget survives close so
  // the sheet keeps its content through the exit animation; editOpen drives
  // `visible`.
  const [editTarget, setEditTarget] = useState<{
    set: SetShape;
    setNumber: number;
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onEditSet = useCallback(
    (s: SetShape, setNumber: number, exerciseId: string, exerciseName: string) => {
      setEditTarget({ set: s, setNumber, exerciseId, exerciseName });
      setEditOpen(true);
    },
    [],
  );

  const onDeleteWorkout = useCallback(async () => {
    if (!userId || !detail.data) return;
    setDeleting(true);
    try {
      const { workout, exercises } = detail.data;
      const exerciseIds = exercises
        .map((we) => we.exercise?.id)
        .filter((exId): exId is string => !!exId);
      await deleteWorkoutAndRecompute(userId, workout.id, exerciseIds);
      // Freshness (spec §5): same trio useFinishWorkout invalidates.
      void qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      router.back();
    } finally {
      setDeleting(false);
    }
  }, [userId, detail.data, qc]);

  if (detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  if (!detail.data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <EmptyState title="Workout not found." />
      </SafeAreaView>
    );
  }

  const { workout, exercises } = detail.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <FadeInView>
          <View style={styles.header}>
            <Text variant="title" color={theme.color.ink}>
              {workout.title}
            </Text>
            <Text variant="strip" color={theme.color.inkTertiary}>
              {/* Time of day answers "when did I train" (spec 2026-08-09) */}
              {formatShortDate(workout.started_at)} · {formatTimeOfDay(workout.started_at)} ·{' '}
              {formatDuration(workout.started_at, workout.ended_at)}
            </Text>
            {workout.note ? (
              <Text variant="meta" color={theme.color.inkSecondary} style={styles.note}>
                {workout.note}
              </Text>
            ) : null}
          </View>
        </FadeInView>

        {exercises.map((we, exIndex) => (
          <FadeInView key={we.id} delay={staggerDelay(exIndex + 1)}>
            <Plate tone="ghost" style={styles.exBlock} faceStyle={styles.exFace}>
              <View style={styles.exHeader}>
                <Text
                  variant="card"
                  color={theme.color.ink}
                  numberOfLines={1}
                  style={styles.exName}
                >
                  {we.exercise?.name ?? 'Unknown exercise'}
                </Text>
                {/* When this exercise happened: its first completed set. */}
                {(() => {
                  const first = we.sets.find((s) => s.completed && s.completed_at);
                  return first?.completed_at ? (
                    <Text variant="strip" color={theme.color.inkTertiary}>
                      {formatTimeOfDay(first.completed_at)}
                    </Text>
                  ) : null;
                })()}
              </View>
              {we.note ? (
                <Text variant="meta" color={theme.color.inkSecondary} style={styles.note}>
                  {we.note}
                </Text>
              ) : null}
              <View>
                {we.sets.map((s, idx) => {
                  const rowContent = (
                    <>
                      <Text
                        variant="numeral"
                        color={theme.color.inkTertiary}
                        style={styles.setIndex}
                      >
                        {idx + 1}
                      </Text>
                      <Text variant="numeral" color={theme.color.ink} style={styles.setCell}>
                        {/* Each set shows the unit it was logged in (#131/#135); a
                            completed weightless set is bodyweight (spec §4). */}
                        {s.completed && s.weight == null
                          ? 'BW'
                          : formatWeight(s.weight, s.units ?? DEFAULT_UNITS)}{' '}
                        × {s.reps != null ? s.reps : '-'}
                      </Text>
                      <View style={styles.setDone}>
                        {s.completed ? (
                          // Ink, not volt: history is a record, not an act-now moment.
                          <Icon name="check" size={18} color={theme.color.ink} stroke={2.5} />
                        ) : (
                          <Text variant="meta" color={theme.color.inkTertiary}>
                            ·
                          </Text>
                        )}
                      </View>
                    </>
                  );

                  const exercise = we.exercise;
                  if (!exercise) {
                    // No exerciseId → no recompute target; leave un-pressable.
                    return (
                      <View key={s.id} style={[styles.setRow, idx > 0 && styles.setRowRuled]}>
                        {rowContent}
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() =>
                        onEditSet(setRowToShape(s), idx + 1, exercise.id, exercise.name)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Edit set ${idx + 1}, ${exercise.name}`}
                      hitSlop={theme.space.s2}
                      style={({ pressed }) => [
                        styles.setRow,
                        idx > 0 && styles.setRowRuled,
                        pressed && styles.setRowPressed,
                      ]}
                    >
                      {rowContent}
                    </Pressable>
                  );
                })}
              </View>
            </Plate>
          </FadeInView>
        ))}

        <Button
          label="Delete workout"
          kind="danger"
          size="row"
          loading={deleting}
          onPress={() => setDeleteConfirm(true)}
          accessibilityLabel="Delete this workout"
          accessibilityHint="Removes it from history and recomputes records"
          style={styles.deleteBtn}
        />
      </ScrollView>

      {editTarget && userId ? (
        <EditSetSheet
          visible={editOpen}
          set={editTarget.set}
          setNumber={editTarget.setNumber}
          exerciseName={editTarget.exerciseName}
          exerciseId={editTarget.exerciseId}
          userId={userId}
          units={units}
          weightStep={weightStep}
          weightUnit={weightUnit}
          confirmDelete
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      <ConfirmSheet
        visible={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete workout?"
        message={`Removes ${exercises.length} ${
          exercises.length === 1 ? 'exercise' : 'exercises'
        } and their sets from history and records.`}
        confirmLabel="Delete workout"
        destructive
        onConfirm={() => void onDeleteWorkout()}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.space.page,
    },
    scroll: { padding: theme.space.page, paddingBottom: theme.space.s12 },
    header: { gap: theme.space.s1, marginBottom: theme.space.s6 },
    exBlock: {
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    exFace: { paddingVertical: theme.space.s4, gap: theme.space.s3 },
    exHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: theme.space.s3,
    },
    exName: { flexShrink: 1 },
    note: { fontStyle: 'italic' },
    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.space.s2,
      gap: theme.space.s3,
    },
    setRowRuled: {
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    // Quiet opacity dip — matches Today.tsx's historyLink press feedback
    // (this screen stays ink/danger only, no volt).
    setRowPressed: { opacity: 0.6 },
    setIndex: {
      width: 24,
    },
    setCell: {
      flex: 1,
    },
    setDone: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtn: { marginTop: theme.space.section, alignSelf: 'center' },
  });
