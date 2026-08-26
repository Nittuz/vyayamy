import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { setRowToShape, type SetShape } from '@/components/activeSet';
import { EditSetSheet } from '@/components/EditSetSheet';
import { formatDuration, formatShortDate, formatTimeOfDay, formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { queryKeys } from '@/queries/keys';
import { useProfile } from '@/queries/profile';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { deleteWorkoutAndRecompute, undoWorkoutDelete } from '@/queries/workouts';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { Icon } from '@/ui/icons';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useSyncAwareErrorToast, useToast } from '@/ui/ToastContext';
import { UNDO_HOLD_MS } from '@/ui/toastLogic';
import { useTheme, type Theme } from '@/ui/useTheme';
import { useFontScale } from '@/ui/useFontScale';

// Top inset is the nav header's job on this pushed screen (WorkoutActive
// precedent) — the deprecated RN SafeAreaView this replaces added none here.
const SCREEN_EDGES: Edge[] = ['left', 'right', 'bottom'];

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useWorkoutDetail(id);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Sizes the trailing chevron on pressable set rows — it sits inline with
  // numeral text, so it rides the same capped scale as Today's history-link
  // arrow (impeccable r2 wave 2 S3).
  const fontScale = useFontScale();
  const qc = useQueryClient();
  // Mirrors WorkoutActive's toastError construction exactly (WorkoutActive.tsx:63-64).
  const syncAwareError = useSyncAwareErrorToast();
  const toastError = useCallback((msg: string) => syncAwareError(msg), [syncAwareError]);
  const { showToast } = useToast();

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
  const [deleting, setDeleting] = useState(false);
  // Ref latch, not the `deleting` state (Today quick-log precedent,
  // quickLogStartingRef): the Delete button stays tappable until React
  // re-renders with `deleting: true`, so a rapid double-tap can land before
  // that state update has committed. A ref read is synchronous.
  const deletingRef = useRef(false);

  const onEditSet = useCallback(
    (s: SetShape, setNumber: number, exerciseId: string, exerciseName: string) => {
      setEditTarget({ set: s, setNumber, exerciseId, exerciseName });
      setEditOpen(true);
    },
    [],
  );

  const onDeleteWorkout = useCallback(async () => {
    if (!userId || !detail.data || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const { workout, exercises } = detail.data;
      const exerciseIds = exercises
        .map((we) => we.exercise?.id)
        .filter((exId): exId is string => !!exId);
      const rows = await deleteWorkoutAndRecompute(userId, workout.id, exerciseIds);
      // Freshness (spec §5): same trio useFinishWorkout invalidates.
      void qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      router.back();
      // Undo spec §3: delete is immediate, recoverable for a beat after.
      // ToastProvider mounts above the navigator, so the toast survives
      // router.back(). The closure captures rows/userId/exerciseIds as they
      // stood at THIS delete.
      showToast('Workout deleted', 'info', {
        actionLabel: 'Undo',
        holdMs: UNDO_HOLD_MS,
        onAction: () => {
          void undoWorkoutDelete(userId, rows, exerciseIds)
            .then(() => {
              void qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
              void qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
              void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
            })
            .catch(() => {
              toastError("Couldn't undo the delete. Try again.");
            });
        },
      });
    } catch {
      // deleteWorkoutAndRecompute isn't a mutation hook, so this screen owns
      // the failure surface (F2): toast + stay put, matching the tone of
      // useFinishWorkout's onError copy. Don't pop the screen on failure.
      toastError("Couldn't delete the workout. Try again.");
    } finally {
      setDeleting(false);
      deletingRef.current = false;
    }
  }, [userId, detail.data, qc, toastError, showToast]);

  if (detail.isLoading) {
    return (
      <SafeAreaView edges={SCREEN_EDGES} style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  if (!detail.data) {
    return (
      <SafeAreaView edges={SCREEN_EDGES} style={[styles.container, styles.center]}>
        <EmptyState title="Workout not found." />
      </SafeAreaView>
    );
  }

  const { workout, exercises } = detail.data;
  // Gates the correction hint below: once every set across the workout has
  // been undo-deleted, "Tap a set to correct it" points at nothing tappable
  // (reviewer minor, live-QA).
  const hasTappableSets = exercises.some((we) => we.sets.length > 0);

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <FadeInView>
          <View style={styles.header}>
            <Text variant="title" color={theme.color.ink}>
              {workout.title}
            </Text>
            <Text variant="strip" color={theme.color.inkTertiary}>
              {/* Time of day answers "when did I train" (spec 2026-08-09).
                  Duration drops out honestly if the workout never ended,
                  rather than rendering a bare "· -" (impeccable batch 5). */}
              {[
                formatShortDate(workout.started_at),
                formatTimeOfDay(workout.started_at),
                formatDuration(workout.started_at, workout.ended_at),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {/* Correction affordance (P2, impeccable r2 wave 2 S3): names the
                interaction up front — inkTertiary now passes body contrast.
                Gated on hasTappableSets — once every set is undo-deleted,
                there's nothing left to tap (reviewer minor, live-QA). */}
            {hasTappableSets ? (
              <Text variant="meta" color={theme.color.inkTertiary}>
                Tap a set to correct it.
              </Text>
            ) : null}
            {workout.note ? (
              <Text variant="meta" color={theme.color.inkSecondary} style={styles.note}>
                {workout.note}
              </Text>
            ) : null}
          </View>
        </FadeInView>

        {exercises.map((we, exIndex) => {
          // A set-delete (undo spec §3) can empty an exercise's sets while
          // leaving the exercise row itself in place — post-prune, that used
          // to render a bare header block (name + nothing). Skip it entirely
          // unless there's a note to show; a note is still content worth
          // keeping even with zero sets.
          if (we.sets.length === 0 && !we.note) return null;
          return (
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
                        {/* Record-quiet correction affordance (S3): only rows
                          that are actually pressable earn the chevron. */}
                        <Icon
                          name="chevron-right"
                          size={Math.round(14 * fontScale)}
                          color={theme.color.inkTertiary}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </Plate>
            </FadeInView>
          );
        })}

        {/* Demoted (P2, impeccable r2 wave 2 S3): a hairline rule + extra top
            margin stop Delete from reading as the screen's visual conclusion. */}
        <View style={styles.deleteSection}>
          <Button
            label="Delete workout"
            kind="danger"
            size="row"
            loading={deleting}
            onPress={() => void onDeleteWorkout()}
            accessibilityLabel="Delete this workout"
            accessibilityHint="Removes it from history and recomputes records"
            style={styles.deleteBtn}
          />
        </View>
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
          onClose={() => setEditOpen(false)}
          onError={toastError}
        />
      ) : null}
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
    // Quiet opacity dip — matches Today.tsx's historyLink press feedback.
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
    deleteSection: {
      marginTop: theme.space.section,
      paddingTop: theme.space.section,
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    deleteBtn: { alignSelf: 'center' },
  });
