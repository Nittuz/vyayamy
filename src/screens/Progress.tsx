import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/useAuth';
import { formatRelativeDate } from '@/core/format';
import { getHeaviestWeightHistory, useGroupedPRs } from '@/queries/personalRecords';
import { LineChart } from '@/ui/LineChart';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { theme } from '@/ui/theme';

const PR_LABEL: Record<string, string> = {
  heaviest_weight: 'Heaviest',
  best_volume: 'Best volume',
  most_reps_at_weight: 'Most reps',
};

export default function ProgressScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: prs, isLoading } = useGroupedPRs(userId);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const active = selectedExercise ?? prs?.[0]?.exerciseId ?? null;
  const activeName = prs?.find((p) => p.exerciseId === active)?.exerciseName ?? '';

  const { width: windowWidth } = useWindowDimensions();
  const screenW = windowWidth - theme.space.page * 2;

  const { data: series = [] } = useQuery({
    queryKey: ['weight-history', userId, active],
    queryFn: async () => {
      if (!userId || !active) return [];
      const rows = await getHeaviestWeightHistory(userId, active);
      return rows.map((r) => ({ x: new Date(r.achievedAt).getTime(), y: r.weight }));
    },
    enabled: !!userId && !!active,
  });

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Progress</Text>
          <SyncIndicator />
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.space.s10 }} />
        ) : (prs?.length ?? 0) === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No PRs yet</Text>
            <Text style={styles.emptyBody}>
              Complete a few sets and your personal records will show up here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>{activeName || 'Heaviest weight'}</Text>
              <LineChart
                data={series}
                width={screenW}
                height={180}
                xTickFormatter={(v) =>
                  new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal records</Text>
              {(prs ?? []).map((g) => (
                <Pressable
                  key={g.exerciseId}
                  onPress={() => setSelectedExercise(g.exerciseId)}
                  style={({ pressed }) => [
                    styles.prRow,
                    g.exerciseId === active && styles.prRowActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prExercise}>{g.exerciseName}</Text>
                    <View style={styles.prMetaRow}>
                      {g.records.map((r) => (
                        <Text key={r.id} style={styles.prBadge}>
                          {PR_LABEL[r.type] ?? r.type}: {r.displayValue}
                        </Text>
                      ))}
                    </View>
                  </View>
                  {g.hasRecent ? <View style={styles.recentDot} /> : null}
                  <Text style={styles.prDate}>
                    {g.records[0] ? formatRelativeDate(g.records[0].achievedAt) : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s5, paddingBottom: theme.space.s12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
  title: {
    flex: 1,
    fontSize: theme.font.display,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
    letterSpacing: -0.5,
  },
  chartCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  chartTitle: {
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  section: { gap: theme.space.s2 },
  sectionTitle: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
    marginBottom: theme.space.s2,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  prRowActive: { borderColor: theme.color.accent },
  prExercise: {
    fontSize: theme.font.body,
    fontWeight: theme.font.weight.medium,
    color: theme.color.text,
  },
  prMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: 4 },
  prBadge: {
    fontSize: theme.font.micro,
    color: theme.color.textSecondary,
    backgroundColor: theme.color.bg,
    paddingVertical: 2,
    paddingHorizontal: theme.space.s2,
    borderRadius: theme.radius.full,
  },
  prDate: {
    fontSize: theme.font.micro,
    color: theme.color.textTertiary,
  },
  recentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.pr,
  },
  empty: {
    alignItems: 'center',
    padding: theme.space.s8,
    gap: theme.space.s2,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  emptyTitle: {
    fontSize: theme.font.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  emptyBody: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
});
