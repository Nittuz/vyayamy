import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ExercisePicker } from '@/components/ExercisePicker';
import { useAuth } from '@/auth/useAuth';
import { formatRelativeDate, formatShortDate } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { queryKeys } from '@/queries/keys';
import { useProfile } from '@/queries/profile';
import {
  useGroupedPRs,
  getHeaviestWeightHistory,
  getBestSetVolumeHistory,
  recomputeAllPRs,
} from '@/queries/personalRecords';
import { FadeInView } from '@/ui/FadeInView';
import { Icon } from '@/ui/icons';
import { LineChart, type ChartPoint } from '@/ui/LineChart';
import { Plate } from '@/ui/Plate';
import { Segment } from '@/ui/Segment';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

const PR_LABEL: Record<string, string> = {
  heaviest_weight: 'Heaviest',
  best_volume: 'Best volume',
  most_reps_at_weight: 'Most reps',
};

type RangeKey = '8w' | '12w' | 'all';
const RANGES: { key: RangeKey; label: string; weeks: number | null }[] = [
  { key: '8w', label: '8 weeks', weeks: 8 },
  { key: '12w', label: '12 weeks', weeks: 12 },
  { key: 'all', label: 'All', weeks: null },
];

type MetricKey = 'heaviest' | 'volume';
const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'heaviest', label: 'Heaviest' },
  { key: 'volume', label: 'Volume' },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>('12w');
  const [metric, setMetric] = useState<MetricKey>('heaviest');
  const [scrubbed, setScrubbed] = useState<ChartPoint | null>(null);
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
  const activeName =
    (active === selectedExercise ? selectedExerciseName : null) ??
    prs?.find((p) => p.exerciseId === active)?.exerciseName ??
    '';

  const { width: windowWidth } = useWindowDimensions();
  const screenW = windowWidth - theme.space.page * 2 - theme.space.s4 * 2;

  // Full series for the active exercise + selected metric. Range filtering and
  // PR-marker detection happen below, off this one fetch.
  const { data: fullSeries = [] } = useQuery({
    queryKey:
      userId && active
        ? [...queryKeys.sets.weightHistory(userId, active), units, metric]
        : ['sets', 'weight-history', 'none', metric],
    queryFn: async (): Promise<ChartPoint[]> => {
      if (!userId || !active) return [];
      if (metric === 'volume') {
        const rows = await getBestSetVolumeHistory(userId, active, units);
        return rows.map((r) => ({ x: new Date(r.achievedAt).getTime(), y: r.volume }));
      }
      const rows = await getHeaviestWeightHistory(userId, active, units);
      return rows.map((r) => ({ x: new Date(r.achievedAt).getTime(), y: r.weight }));
    },
    enabled: !!userId && !!active,
  });

  // Filter to the visible window by a cutoff timestamp (nothing persisted).
  // Anchor the window to the most recent session rather than wall-clock so the
  // chart always shows the latest N weeks of data even if the last lift was a
  // few days ago — and so the memo stays pure (no Date.now() in render).
  const series = useMemo(() => {
    const weeks = RANGES.find((r) => r.key === range)?.weeks ?? null;
    if (weeks == null || fullSeries.length === 0) return fullSeries;
    const latest = fullSeries[fullSeries.length - 1]!.x;
    const cutoff = latest - weeks * WEEK_MS;
    return fullSeries.filter((p) => p.x >= cutoff);
  }, [fullSeries, range]);

  // PR markers: each point that is a new running max within the visible window.
  const markers = useMemo(() => {
    const out: { x: number }[] = [];
    let best = -Infinity;
    for (const p of series) {
      if (p.y > best) {
        best = p.y;
        out.push({ x: p.x });
      }
    }
    return out;
  }, [series]);

  // Header numeral = current best in window; delta = latest vs first in window.
  // Both metrics carry the same weight unit (volume is weight×reps in `units`).
  const headline = useMemo(() => {
    if (series.length === 0) return null;
    const latest = series[series.length - 1]!.y;
    const first = series[0]!.y;
    const delta = Math.round((latest - first) * 10) / 10;
    return { value: latest, delta, unit: units };
  }, [series, units]);

  const unitSuffix = ` ${units}`;
  const metricNoun = metric === 'volume' ? 'volume' : 'heaviest weight';

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text variant="display" color={theme.color.ink} style={styles.title}>
            Progress
          </Text>
          <SyncIndicator />
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.space.s10 }} />
        ) : (prs?.length ?? 0) === 0 ? (
          <Plate faceStyle={styles.emptyFace}>
            <Text variant="card" color={theme.color.ink}>
              No PRs yet
            </Text>
            <Text variant="meta" color={theme.color.inkSecondary} style={styles.emptyBody}>
              Complete a few sets and your personal records will show up here.
            </Text>
          </Plate>
        ) : (
          <>
            <Plate faceStyle={styles.chartFace}>
              {/* exercise selector — ungated; any exercise with history charts */}
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Charted exercise: ${activeName || 'none'}. Tap to change.`}
                style={({ pressed }) => [styles.exerciseSelect, pressed && styles.pressed]}
              >
                <Text variant="label" color={theme.color.inkTertiary}>
                  Exercise
                </Text>
                <View style={styles.exerciseSelectRow}>
                  <Text
                    variant="title"
                    color={theme.color.ink}
                    numberOfLines={1}
                    style={styles.flex}
                  >
                    {activeName || 'Select exercise'}
                  </Text>
                  <Icon name="chevron-down" size={18} color={theme.color.inkSecondary} />
                </View>
              </Pressable>

              {/* current best + delta over the visible window */}
              <View style={styles.headlineRow}>
                <Text variant="numeralLg" color={theme.color.inkHero}>
                  {headline
                    ? `${trim(headline.value)}${headline.unit ? ` ${headline.unit}` : ''}`
                    : '—'}
                </Text>
                {headline ? (
                  <Text
                    variant="numeral"
                    color={headline.delta > 0 ? theme.color.accent : theme.color.inkTertiary}
                  >
                    {headline.delta > 0
                      ? `+${trim(headline.delta)} ${headline.unit}`
                      : headline.delta < 0
                        ? `${trim(headline.delta)} ${headline.unit}`
                        : '—'}
                  </Text>
                ) : null}
              </View>

              {/* scrub read-out replaces the metric caption while scrubbing */}
              <Text variant="meta" color={theme.color.inkSecondary}>
                {scrubbed
                  ? `${formatShortDate(new Date(scrubbed.x).toISOString())} · ${trim(scrubbed.y)}${unitSuffix}`
                  : `Best ${metricNoun} per session`}
              </Text>

              <LineChart
                data={series}
                width={screenW}
                height={188}
                unitSuffix={unitSuffix}
                markers={markers}
                onScrub={setScrubbed}
                scrubX={scrubbed?.x ?? null}
                xTickFormatter={(v) =>
                  new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
              />

              {/* range window control */}
              <Segment
                size="sm"
                options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
                value={range}
                onChange={setRange}
              />

              {/* metric control */}
              <Segment
                size="sm"
                options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
                value={metric}
                onChange={(m) => {
                  setMetric(m);
                  setScrubbed(null);
                }}
              />
            </Plate>

            <View style={styles.section}>
              <Text variant="label" color={theme.color.inkTertiary} style={styles.sectionTitle}>
                Personal records
              </Text>
              {(prs ?? []).map((g, i) => {
                const isActive = g.exerciseId === active;
                return (
                  <FadeInView key={g.exerciseId} delay={i * 40}>
                    <Plate
                      onPress={() => {
                        setSelectedExercise(g.exerciseId);
                        setSelectedExerciseName(g.exerciseName);
                        setScrubbed(null);
                      }}
                      border={isActive ? 'strong' : 'soft'}
                      tone={isActive ? 'surface2' : 'surface'}
                      accessibilityRole="button"
                      accessibilityLabel={`${g.exerciseName} records. Tap to chart.`}
                      accessibilityState={{ selected: isActive }}
                      faceStyle={styles.prFace}
                    >
                      <View style={styles.flex}>
                        <Text variant="card" color={theme.color.ink}>
                          {g.exerciseName}
                        </Text>
                        <View style={styles.prMetaRow}>
                          {g.records.map((r) => (
                            <View key={r.id} style={styles.prBadge}>
                              <Text variant="meta" color={theme.color.inkSecondary}>
                                {PR_LABEL[r.type] ?? r.type}: {r.displayValue}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      {g.hasRecent ? <View style={styles.recentDot} /> : null}
                      <Text variant="meta" color={theme.color.inkTertiary}>
                        {g.records[0] ? formatRelativeDate(g.records[0].achievedAt) : ''}
                      </Text>
                    </Plate>
                  </FadeInView>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {userId ? (
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(exerciseId) => {
            setSelectedExercise(exerciseId);
            // The picker only returns the id; clear the cached name and let the
            // PR list (if it has this exercise) supply one, else show the id-less
            // fallback until the chart loads.
            const fromPr = prs?.find((p) => p.exerciseId === exerciseId)?.exerciseName ?? null;
            setSelectedExerciseName(fromPr);
            setScrubbed(null);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Trim a trailing ".0" so 100.0 reads as 100 but 102.5 keeps its decimal. */
function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: {
      padding: theme.space.page,
      gap: theme.space.s4,
      paddingBottom: theme.space.s12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
    title: { flex: 1 },
    flex: { flex: 1 },
    pressed: { opacity: 0.7 },

    chartFace: { padding: theme.space.s4, gap: theme.space.s3 },
    exerciseSelect: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      gap: theme.space.half,
    },
    exerciseSelectRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s2 },
    headlineRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.s3 },

    section: { gap: theme.space.s2 },
    sectionTitle: { marginTop: theme.space.s2, marginBottom: theme.space.s1 },

    prFace: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s3,
      padding: theme.space.s4,
    },
    prMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.s2,
      marginTop: theme.space.s1,
    },
    prBadge: {
      paddingVertical: theme.space.half,
      paddingHorizontal: theme.space.s2,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.bg,
      borderWidth: theme.depth.rule,
      borderColor: theme.color.border,
    },
    recentDot: {
      width: 7,
      height: 7,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.accent,
    },

    emptyFace: { padding: theme.space.s8, gap: theme.space.s2, alignItems: 'center' },
    emptyBody: { textAlign: 'center' },
  });
