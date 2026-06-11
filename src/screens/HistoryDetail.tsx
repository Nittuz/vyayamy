import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatDuration, formatShortDate, formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { useTheme } from '@/ui/useTheme';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useWorkoutDetail(id);
  const theme = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: theme.space.page, gap: theme.space.s4 },
    header: { gap: theme.space.s1 },
    title: {
      fontFamily: theme.font.family.sansSemibold,
      fontSize: theme.font.size.title,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
    },
    subtitle: { fontFamily: theme.font.family.sans, fontSize: theme.font.size.meta, color: theme.color.inkSecondary },
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.md,
      padding: theme.space.s4,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space.s2,
    },
    exName: {
      fontFamily: theme.font.family.sansSemibold,
      fontSize: theme.font.size.card,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
    },
    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.space.s1,
      gap: theme.space.s3,
    },
    setIndex: {
      width: 24,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.meta,
      color: theme.color.inkTertiary,
      fontVariant: ['tabular-nums'],
    },
    setCell: {
      flex: 1,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      fontVariant: ['tabular-nums'],
    },
    setDone: { width: 20, textAlign: 'center', color: theme.color.inkTertiary },
    setDoneOn: { fontFamily: theme.font.family.sansSemibold, color: theme.color.success, fontWeight: theme.font.weight.semibold },
    empty: { color: theme.color.inkSecondary },
  }), [theme]);

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
                  {/* Each set shows the unit it was logged in (#131/#135). */}
                  {formatWeight(s.weight, s.units ?? DEFAULT_UNITS)} × {s.reps != null ? s.reps : '–'}
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
