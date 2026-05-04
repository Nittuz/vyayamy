import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatDuration, formatShortDate } from '@/core/format';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { theme } from '@/ui/theme';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useWorkoutDetail(id);

  if (detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!detail.data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.empty}>Workout not found.</Text>
      </SafeAreaView>
    );
  }

  const { workout, exercises } = detail.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>{workout.title}</Text>
          <Text style={styles.subtitle}>
            {formatShortDate(workout.started_at)} · {formatDuration(workout.started_at, workout.ended_at)}
          </Text>
        </View>

        {exercises.map((we) => (
          <View key={we.id} style={styles.card}>
            <Text style={styles.exName}>{we.exercise?.name ?? 'Unknown'}</Text>
            {we.sets.map((s, idx) => (
              <View key={s.id} style={styles.setRow}>
                <Text style={styles.setIndex}>{idx + 1}</Text>
                <Text style={styles.setCell}>
                  {s.weight != null ? s.weight : '–'} × {s.reps != null ? s.reps : '–'}
                </Text>
                <Text style={[styles.setDone, s.completed && styles.setDoneOn]}>
                  {s.completed ? '✓' : '·'}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: theme.space.page, gap: theme.space.s4 },
  header: { gap: theme.space.s1 },
  title: {
    fontSize: theme.font.title,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
  },
  subtitle: { fontSize: theme.font.meta, color: theme.color.textSecondary },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.space.s2,
  },
  exName: {
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space.s1,
    gap: theme.space.s3,
  },
  setIndex: {
    width: 24,
    fontSize: theme.font.meta,
    color: theme.color.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  setCell: {
    flex: 1,
    fontSize: theme.font.body,
    color: theme.color.text,
    fontVariant: ['tabular-nums'],
  },
  setDone: { width: 20, textAlign: 'center', color: theme.color.textTertiary },
  setDoneOn: { color: theme.color.success, fontWeight: theme.font.weight.bold },
  empty: { color: theme.color.textSecondary },
});
