import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { formatDuration, formatShortDate, formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useWorkoutDetail(id);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
        <Text variant="meta" color={theme.color.inkSecondary}>
          Workout not found.
        </Text>
      </SafeAreaView>
    );
  }

  const { workout, exercises } = detail.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="title" color={theme.color.ink}>
            {workout.title}
          </Text>
          <Text variant="meta" color={theme.color.inkSecondary}>
            {formatShortDate(workout.started_at)} ·{' '}
            {formatDuration(workout.started_at, workout.ended_at)}
          </Text>
        </View>

        {exercises.map((we) => (
          <Plate key={we.id} offset="sm" faceStyle={styles.exFace}>
            <Text variant="card" color={theme.color.ink}>
              {we.exercise?.name ?? 'Unknown'}
            </Text>
            <View>
              {we.sets.map((s, idx) => (
                <View
                  key={s.id}
                  style={[styles.setRow, idx > 0 && styles.setRowRuled]}
                >
                  <Text variant="numeral" color={theme.color.inkTertiary} style={styles.setIndex}>
                    {idx + 1}
                  </Text>
                  <Text variant="numeral" color={theme.color.ink} style={styles.setCell}>
                    {/* Each set shows the unit it was logged in (#131/#135). */}
                    {formatWeight(s.weight, s.units ?? DEFAULT_UNITS)} ×{' '}
                    {s.reps != null ? s.reps : '–'}
                  </Text>
                  <View style={styles.setDone}>
                    {s.completed ? (
                      <Icon name="check" size={18} color={theme.color.success} stroke={2.5} />
                    ) : (
                      <Text variant="meta" color={theme.color.inkTertiary}>
                        ·
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Plate>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
    header: { gap: theme.space.s1 },
    exFace: { padding: theme.space.s4, gap: theme.space.s3 },
    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.space.s2,
      gap: theme.space.s3,
    },
    setRowRuled: {
      borderTopWidth: theme.depth.rule,
      borderTopColor: theme.color.border,
    },
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
  });
