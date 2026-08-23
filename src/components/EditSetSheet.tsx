/**
 * EditSetSheet — edit or delete a banked set without leaving the workout
 * (backlog 1.1, P1). Weight/reps steppers on the Sheet primitive; Save commits
 * through useUpdateSet, Delete through useDeleteSet, and both kick the
 * personal-records recompute path so an edited or removed set can never leave
 * a phantom PR behind (recompute is authoritative, #138).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type SetShape } from '@/components/activeSet';
import { NumericStepper, type NumericStepperHandle } from '@/components/NumericStepperView';
import { queryKeys } from '@/queries/keys';
import { recomputeExercisePRs } from '@/queries/personalRecords';
import { useDeleteSet, useUpdateSet } from '@/queries/sets';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { haptics } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  /** The banked set being edited. */
  set: SetShape;
  /** 1-based display number of the set within its exercise. */
  setNumber: number;
  exerciseName: string;
  exerciseId: string;
  userId: string;
  units: 'kg' | 'lb';
  weightStep: number; // 2.5 (kg) or 5 (lb)
  weightUnit: 'LB' | 'KG';
  /** Gate Delete behind a confirm — finished sets are records (spec 2026-08-22 §1). */
  confirmDelete?: boolean;
  onClose: () => void;
  onError?: (msg: string) => void;
}

export function EditSetSheet({
  visible,
  set,
  setNumber,
  exerciseName,
  exerciseId,
  userId,
  units,
  weightStep,
  weightUnit,
  confirmDelete = false,
  onClose,
  onError,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const qc = useQueryClient();
  const updateSet = useUpdateSet(onError);
  const deleteSet = useDeleteSet(onError);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Ref latch, not `deleteSet.isPending` (HistoryDetail's deletingRef
  // precedent): ConfirmSheet's confirm button stays tappable through its
  // ~220ms exit animation, so a second tap can land before `isPending`'s
  // state update has committed. A ref read is synchronous; mutation state
  // isn't. Reset once the mutation settles (success or error) — this sheet
  // stays mounted across open/close cycles (the parent keeps `editTarget`
  // alive through the exit animation), so the ref must not stay latched.
  const deletingRef = useRef(false);

  const [weight, setWeight] = useState<number | null>(set.weight);
  const [reps, setReps] = useState<number | null>(set.reps);

  const weightRef = useRef<NumericStepperHandle>(null);
  const repsRef = useRef<NumericStepperHandle>(null);

  // Re-seed the drafts whenever a different set is opened.
  useEffect(() => {
    setWeight(set.weight);
    setReps(set.reps);
  }, [set.id, set.weight, set.reps]);

  // Fire-and-forget: the recompute path is serialized internally and only
  // counts finished workouts, so this is safe to kick after every edit.
  // Invalidate Progress/History so a correction here shows up on next focus
  // without waiting for a pull (spec 2026-08-22 §5).
  const recompute = () => {
    void recomputeExercisePRs(userId, exerciseId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
        void qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
      })
      .catch(() => {});
  };

  const handleSave = () => {
    haptics.light();
    // Flush any open keypad edit FIRST so Save can never bank a stale draft
    // (flush-before-consume, spec §1/§3). A committed null is a real clear —
    // fall back to draft state only when a ref isn't mounted.
    const nextWeight = weightRef.current ? weightRef.current.flushEdit() : weight;
    const nextReps = repsRef.current ? repsRef.current.flushEdit() : reps;
    // Defensive draft sync: keep local state matching what we're banking.
    setWeight(nextWeight);
    setReps(nextReps);
    updateSet.mutate(
      {
        setId: set.id,
        weId: set.weId,
        // Unit stamped only when a weight is present (per-set provenance,
        // #131). Clearing keeps set.units — editing a LOGGED set preserves its
        // historical stamp, unlike the live card (WorkoutActive.onChangeWeight)
        // which nulls it. Don't "unify" these.
        patch: {
          weight: nextWeight,
          reps: nextReps,
          units: nextWeight != null ? units : set.units,
        },
      },
      {
        onSuccess: () => {
          recompute();
          onClose();
        },
      },
    );
  };

  const handleDelete = () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    haptics.medium();
    deleteSet.mutate(
      { setId: set.id, weId: set.weId },
      {
        onSuccess: () => {
          recompute();
          onClose();
        },
        onSettled: () => {
          deletingRef.current = false;
        },
      },
    );
  };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title={`Edit set ${setNumber}`}
        footer={
          <>
            <Button
              label="Save changes"
              size="row"
              loading={updateSet.isPending}
              onPress={handleSave}
              accessibilityLabel={`Save changes to set ${setNumber}`}
            />
            <Button
              label="Delete set"
              kind="danger"
              size="row"
              loading={deleteSet.isPending}
              onPress={() => (confirmDelete ? setDeleteConfirm(true) : handleDelete())}
              accessibilityLabel={`Delete set ${setNumber}`}
              accessibilityHint="Removes this set from the workout"
            />
          </>
        }
      >
        <Text variant="meta" color={theme.color.inkSecondary}>
          {exerciseName}
        </Text>
        <View style={styles.fieldRow}>
          <Text variant="strip" color={theme.color.inkTertiary}>
            WEIGHT · {weightUnit}
          </Text>
          <NumericStepper
            ref={weightRef}
            value={weight}
            step={weightStep}
            unit={weightUnit}
            onChange={setWeight}
            accessoryLabel="NEXT → REPS"
            onAccessoryPress={() => repsRef.current?.openKeypad()}
            size="inline"
            testID="edit-weight-stepper"
          />
        </View>
        <View style={styles.fieldRow}>
          <Text variant="strip" color={theme.color.inkTertiary}>
            REPS
          </Text>
          <NumericStepper
            ref={repsRef}
            value={reps}
            step={1}
            unit="REPS"
            onChange={setReps}
            accessoryLabel="DONE"
            size="inline"
            testID="edit-reps-stepper"
          />
        </View>
      </Sheet>
      <ConfirmSheet
        visible={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title={`Delete set ${setNumber}?`}
        message="Removes it from this workout and recomputes records."
        confirmLabel="Delete set"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: theme.touch.min,
      marginTop: theme.space.s3,
    },
  });
