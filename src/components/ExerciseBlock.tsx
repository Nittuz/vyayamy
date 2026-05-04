import { StyleSheet, Text, View } from 'react-native';

import type { WorkoutExerciseWithSets } from '@/queries/workoutDetail';
import { theme } from '@/ui/theme';

import { SetsTable } from './SetsTable';

interface Props {
  we: WorkoutExerciseWithSets;
  onChangeSet: (setId: string, patch: { weight?: number | null; reps?: number | null }) => void;
  onToggleComplete: (setId: string, completed: boolean) => void;
  onAddSet: (weId: string) => void;
  onDeleteSet: (setId: string) => void;
}

export function ExerciseBlock({
  we,
  onChangeSet,
  onToggleComplete,
  onAddSet,
  onDeleteSet,
}: Props) {
  const name = we.exercise?.name ?? 'Unknown exercise';
  const muscle = we.exercise?.muscle_group ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        {muscle ? <Text style={styles.muscle}>{muscle}</Text> : null}
      </View>
      <SetsTable
        sets={we.sets}
        onChangeSet={onChangeSet}
        onToggleComplete={onToggleComplete}
        onAddSet={() => onAddSet(we.id)}
        onDeleteSet={onDeleteSet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: theme.space.s4,
    paddingTop: theme.space.s4,
    paddingBottom: theme.space.s3,
  },
  name: {
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  muscle: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    marginTop: theme.space.s1,
  },
});
