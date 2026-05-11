import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Set as SetRow } from '@/db/types';
import { theme } from '@/ui/theme';

interface Props {
  sets: SetRow[];
  onChangeSet: (setId: string, patch: { weight?: number | null; reps?: number | null }) => void;
  onToggleComplete: (setId: string, completed: boolean) => void;
  onAddSet: () => void;
  onDeleteSet: (setId: string) => void;
}

export function SetsTable({ sets, onChangeSet, onToggleComplete, onAddSet, onDeleteSet }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.headerCell}>Set</Text>
        <Text style={[styles.headerCell, styles.flexCol]}>Weight</Text>
        <Text style={[styles.headerCell, styles.flexCol]}>Reps</Text>
        <Text style={styles.headerCell}>Done</Text>
      </View>
      {sets.map((s, idx) => (
        <SetRowView
          key={s.id}
          set={s}
          index={idx}
          onChangeSet={onChangeSet}
          onToggleComplete={onToggleComplete}
          onDeleteSet={onDeleteSet}
        />
      ))}
      <Pressable
        onPress={onAddSet}
        accessibilityRole="button"
        accessibilityLabel="Add set"
        style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.addText}>+ Add set</Text>
      </Pressable>
    </View>
  );
}

interface RowProps {
  set: SetRow;
  index: number;
  onChangeSet: (setId: string, patch: { weight?: number | null; reps?: number | null }) => void;
  onToggleComplete: (setId: string, completed: boolean) => void;
  onDeleteSet: (setId: string) => void;
}

const SetRowView = memo(function SetRowView({
  set,
  index,
  onChangeSet,
  onToggleComplete,
  onDeleteSet,
}: RowProps) {
  // Local controlled state so taps feel instant. Reconcile with prop changes
  // (e.g. background sync pull lands a new weight) only while the field isn't
  // focused, otherwise we'd yank the value out from under the user's typing.
  const [weightStr, setWeightStr] = useState(set.weight != null ? String(set.weight) : '');
  const [repsStr, setRepsStr] = useState(set.reps != null ? String(set.reps) : '');
  const weightFocusedRef = useRef(false);
  const repsFocusedRef = useRef(false);
  const completed = Boolean(set.completed);

  useEffect(() => {
    if (!weightFocusedRef.current) {
      setWeightStr(set.weight != null ? String(set.weight) : '');
    }
  }, [set.weight]);

  useEffect(() => {
    if (!repsFocusedRef.current) {
      setRepsStr(set.reps != null ? String(set.reps) : '');
    }
  }, [set.reps]);

  const commitWeight = useCallback(() => {
    weightFocusedRef.current = false;
    if (weightStr.trim() === '') {
      onChangeSet(set.id, { weight: null });
      return;
    }
    const n = Number(weightStr);
    if (Number.isFinite(n)) {
      onChangeSet(set.id, { weight: n });
    } else {
      // Invalid — revert the input to whatever the model still says.
      setWeightStr(set.weight != null ? String(set.weight) : '');
    }
  }, [weightStr, set.id, set.weight, onChangeSet]);

  const commitReps = useCallback(() => {
    repsFocusedRef.current = false;
    if (repsStr.trim() === '') {
      onChangeSet(set.id, { reps: null });
      return;
    }
    const n = Number.parseInt(repsStr, 10);
    if (Number.isFinite(n)) {
      onChangeSet(set.id, { reps: n });
    } else {
      setRepsStr(set.reps != null ? String(set.reps) : '');
    }
  }, [repsStr, set.id, set.reps, onChangeSet]);

  const onToggle = useCallback(() => {
    if (!completed) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onToggleComplete(set.id, !completed);
  }, [completed, set.id, onToggleComplete]);

  const onLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Alert.alert('Delete set', `Remove set ${index + 1}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteSet(set.id) },
    ]);
  }, [index, set.id, onDeleteSet]);

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, completed && styles.rowCompleted]}
    >
      <Text style={styles.setNum}>{index + 1}</Text>
      <TextInput
        value={weightStr}
        onChangeText={setWeightStr}
        onFocus={() => {
          weightFocusedRef.current = true;
        }}
        onBlur={commitWeight}
        keyboardType="decimal-pad"
        placeholder="–"
        placeholderTextColor={theme.color.textTertiary}
        style={[styles.input, styles.flexCol]}
      />
      <TextInput
        value={repsStr}
        onChangeText={setRepsStr}
        onFocus={() => {
          repsFocusedRef.current = true;
        }}
        onBlur={commitReps}
        keyboardType="number-pad"
        placeholder="–"
        placeholderTextColor={theme.color.textTertiary}
        style={[styles.input, styles.flexCol]}
      />
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark set ${index + 1} ${completed ? 'incomplete' : 'complete'}`}
        style={[styles.checkbox, completed && styles.checkboxChecked]}
      >
        {completed ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.space.s1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space.s3,
    paddingBottom: theme.space.s2,
  },
  headerCell: {
    width: 40,
    fontSize: theme.font.micro,
    color: theme.color.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: theme.font.weight.medium,
    textAlign: 'center',
  },
  flexCol: { flex: 1, width: undefined },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space.s2,
    paddingHorizontal: theme.space.s3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    gap: theme.space.s2,
  },
  rowCompleted: { backgroundColor: theme.color.successSoft },
  setNum: {
    width: 40,
    fontSize: theme.font.body,
    color: theme.color.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  input: {
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.bg,
    textAlign: 'center',
    fontSize: theme.font.body,
    color: theme.color.text,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: theme.space.s2,
  },
  checkbox: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.color.success,
    borderColor: theme.color.success,
  },
  checkmark: { color: theme.color.onAccent, fontWeight: theme.font.weight.bold, fontSize: 18 },
  addRow: {
    paddingVertical: theme.space.s3,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    minHeight: theme.touch.min,
    justifyContent: 'center',
  },
  addText: {
    fontSize: theme.font.meta,
    color: theme.color.accentMuted,
    fontWeight: theme.font.weight.medium,
  },
});
