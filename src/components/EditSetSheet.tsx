/**
 * EditSetSheet — edit or delete a banked set without leaving the workout
 * (backlog 1.1, P1). Weight/reps steppers on the Sheet primitive; Save commits
 * through useUpdateSet, Delete through useDeleteSet, and both kick the
 * personal-records recompute path so an edited or removed set can never leave
 * a phantom PR behind (recompute is authoritative, #138).
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type SetShape } from '@/components/activeSet';
import { NumericStepper } from '@/components/NumericStepperView';
import { recomputeExercisePRs } from '@/queries/personalRecords';
import { useDeleteSet, useUpdateSet } from '@/queries/sets';
import { Button } from '@/ui/Button';
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
  onClose: () => void;
  onError?: (msg: string) => void;
}

type FocusedField = 'weight' | 'reps';

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
  onClose,
  onError,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const updateSet = useUpdateSet(onError);
  const deleteSet = useDeleteSet(onError);

  const [weight, setWeight] = useState<number | null>(set.weight);
  const [reps, setReps] = useState<number | null>(set.reps);
  const [focused, setFocused] = useState<FocusedField>('weight');

  // Re-seed the drafts whenever a different set is opened.
  useEffect(() => {
    setWeight(set.weight);
    setReps(set.reps);
    setFocused('weight');
  }, [set.id, set.weight, set.reps]);

  // Fire-and-forget: the recompute path is serialized internally and only
  // counts finished workouts, so this is safe to kick after every edit.
  const recompute = () => {
    void recomputeExercisePRs(userId, exerciseId).catch(() => {});
  };

  const handleSave = () => {
    haptics.light();
    updateSet.mutate(
      {
        setId: set.id,
        weId: set.weId,
        // Stamp the logging unit whenever a weight is present (per-set
        // provenance, #131); a cleared weight keeps the set's stored unit.
        patch: { weight, reps, units: weight != null ? units : set.units },
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
    haptics.medium();
    deleteSet.mutate(
      { setId: set.id, weId: set.weId },
      {
        onSuccess: () => {
          recompute();
          onClose();
        },
      },
    );
  };

  return (
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
            onPress={handleDelete}
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
          value={weight}
          step={weightStep}
          unit={weightUnit}
          focused={focused === 'weight'}
          onFocus={() => setFocused('weight')}
          onBlur={noop}
          onChange={setWeight}
          size="inline"
          testID="edit-weight-stepper"
        />
      </View>
      <View style={styles.fieldRow}>
        <Text variant="strip" color={theme.color.inkTertiary}>
          REPS
        </Text>
        <NumericStepper
          value={reps}
          step={1}
          unit="REPS"
          focused={focused === 'reps'}
          onFocus={() => setFocused('reps')}
          onBlur={noop}
          onChange={setReps}
          size="inline"
          testID="edit-reps-stepper"
        />
      </View>
    </Sheet>
  );
}

function noop() {}

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
