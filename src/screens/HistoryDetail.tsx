import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { formatDuration, formatShortDate, formatWeight } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { useWorkoutDetail } from '@/queries/workoutDetail';
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
              {formatShortDate(workout.started_at)} ·{' '}
              {formatDuration(workout.started_at, workout.ended_at)}
            </Text>
          </View>
        </FadeInView>

        {exercises.map((we, exIndex) => (
          <FadeInView key={we.id} delay={staggerDelay(exIndex + 1)}>
            <Plate tone="ghost" style={styles.exBlock} faceStyle={styles.exFace}>
              <Text variant="card" color={theme.color.ink}>
                {we.exercise?.name ?? 'Unknown exercise'}
              </Text>
              <View>
                {we.sets.map((s, idx) => (
                  <View key={s.id} style={[styles.setRow, idx > 0 && styles.setRowRuled]}>
                    <Text variant="numeral" color={theme.color.inkTertiary} style={styles.setIndex}>
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
                  </View>
                ))}
              </View>
            </Plate>
          </FadeInView>
        ))}
      </ScrollView>
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
