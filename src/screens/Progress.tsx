import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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

import { useAuth } from '@/auth/useAuth';
import { formatRelativeDate } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { queryKeys } from '@/queries/keys';
import { useProfile } from '@/queries/profile';
import { useGroupedPRs, getHeaviestWeightHistory, recomputeAllPRs } from '@/queries/personalRecords';
import { FadeInView } from '@/ui/FadeInView';
import { LineChart } from '@/ui/LineChart';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useTheme, type Theme } from '@/ui/useTheme';

const PR_LABEL: Record<string, string> = {
  heaviest_weight: 'Heaviest',
  best_volume: 'Best volume',
  most_reps_at_weight: 'Most reps',
};

// Session guard: backfill PRs from existing history at most once per signed-in
// user, the first time Progress is opened. PR detection was added after these
// workouts were logged, so without this their records would never appear.
let prBackfilledFor: string | null = null;

export default function ProgressScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const profileQuery = useProfile(userId);
  const units = profileQuery.data?.units ?? DEFAULT_UNITS;
  const { data: prs, isLoading } = useGroupedPRs(userId, units);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId || prBackfilledFor === userId) return;
    prBackfilledFor = userId;
    void recomputeAllPRs(userId)
      .then(() => qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) }))
      .catch(() => {
        prBackfilledFor = null; // allow a retry on next mount if it failed
      });
  }, [userId, qc]);

  const active = selectedExercise ?? prs?.[0]?.exerciseId ?? null;
  const activeName = prs?.find((p) => p.exerciseId === active)?.exerciseName ?? '';

  const { width: windowWidth } = useWindowDimensions();
  const screenW = windowWidth - theme.space.page * 2;

  const { data: series = [] } = useQuery({
    queryKey:
      userId && active
        ? [...queryKeys.sets.weightHistory(userId, active), units]
        : ['sets', 'weight-history', 'none'],
    queryFn: async () => {
      if (!userId || !active) return [];
      const rows = await getHeaviestWeightHistory(userId, active, units);
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
              {(prs ?? []).map((g, i) => (
                <FadeInView key={g.exerciseId} delay={i * 40}>
                <Pressable
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
                </FadeInView>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s5, paddingBottom: theme.space.s12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
  title: {
    flex: 1,
    fontSize: theme.font.size.display,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
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
    fontSize: theme.font.size.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
  },
  section: { gap: theme.space.s2 },
  sectionTitle: {
    fontSize: theme.font.size.title,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
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
    fontSize: theme.font.size.body,
    fontWeight: theme.font.weight.medium,
    color: theme.color.ink,
  },
  prMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.s2, marginTop: 4 },
  prBadge: {
    fontSize: theme.font.size.micro,
    color: theme.color.inkSecondary,
    backgroundColor: theme.color.bg,
    paddingVertical: 2,
    paddingHorizontal: theme.space.s2,
    borderRadius: theme.radius.full,
  },
  prDate: {
    fontSize: theme.font.size.micro,
    color: theme.color.inkTertiary,
  },
  recentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.accent,
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
    fontSize: theme.font.size.card,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
  },
  emptyBody: {
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    textAlign: 'center',
  },
  });
