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
import { formatRelativeDate, formatShortDate, humanizeEnum } from '@/core/format';
import { DEFAULT_UNITS } from '@/core/units';
import { getKv, registerUserScopedKv, setKv } from '@/lib/kvStore';
import { queryKeys } from '@/queries/keys';
import { useProfile } from '@/queries/profile';
import {
  useGroupedPRs,
  getHeaviestWeightHistory,
  getBestSetVolumeHistory,
  getMostRepsHistory,
  recomputeAllPRs,
} from '@/queries/personalRecords';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { Icon } from '@/ui/icons';
import { LineChart, type ChartPoint } from '@/ui/LineChart';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { resolvePlateStyles } from '@/ui/plateStyles';
import { Segment } from '@/ui/Segment';
import { SettleSlam } from '@/ui/SettleSlam';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

const PR_LABEL: Record<string, string> = {
  heaviest_weight: 'Heaviest',
  most_reps: 'Most reps',
};

type RangeKey = '8w' | '12w' | 'all';
const RANGES: { key: RangeKey; label: string; weeks: number | null }[] = [
  { key: '8w', label: '8 weeks', weeks: 8 },
  { key: '12w', label: '12 weeks', weeks: 12 },
  { key: 'all', label: 'All', weeks: null },
];

type MetricKey = 'heaviest' | 'volume' | 'reps';
const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'heaviest', label: 'Heaviest' },
  { key: 'volume', label: 'Volume' },
  { key: 'reps', label: 'Reps' },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// --- PR backfill guard (backlog 4.2 / #52) ---------------------------------
// recomputeAllPRs backfills records for workouts logged before PR detection
// shipped. That full-history scan is expensive, so it runs once per user on
// this device EVER, not once per app session: a kvStore marker persists
// completion, and the module variable is only the in-memory fast path. The key
// is in the user-scoped registry so sign-out wipes it (the marker stores the
// userId as a second guard). Bump PR_BACKFILL_SCHEMA when PR-detection logic
// changes so existing histories re-backfill once.
const PR_BACKFILL_KEY = '@flexyug/pr-backfill-done/v1';
// v2: 2026-08-09 PR semantics — most_reps replaces best_volume/most_reps_at_weight
// and bodyweight sets now earn rep records, so every device recomputes once.
const PR_BACKFILL_SCHEMA = 2 as const;

interface PrBackfillMarker {
  schemaVersion: typeof PR_BACKFILL_SCHEMA;
  userId: string;
}

let prBackfilledFor: string | null = null;
registerUserScopedKv(PR_BACKFILL_KEY, () => {
  prBackfilledFor = null;
});

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
    // Claim before the async run so a remount mid-backfill can't double-fire.
    prBackfilledFor = userId;
    void (async () => {
      const marker = await getKv<PrBackfillMarker>(PR_BACKFILL_KEY, PR_BACKFILL_SCHEMA);
      if (marker?.userId === userId) return; // already backfilled on this device
      await recomputeAllPRs(userId);
      await setKv<PrBackfillMarker>(PR_BACKFILL_KEY, {
        schemaVersion: PR_BACKFILL_SCHEMA,
        userId,
      });
      await qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
    })().catch(() => {
      prBackfilledFor = null; // allow a retry on next mount if it failed
    });
  }, [userId, qc]);

  const active = selectedExercise ?? prs?.[0]?.exerciseId ?? null;
  const activeName =
    (active === selectedExercise ? selectedExerciseName : null) ??
    prs?.find((p) => p.exerciseId === active)?.exerciseName ??
    '';

  const { width: windowWidth } = useWindowDimensions();

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
      if (metric === 'reps') {
        const rows = await getMostRepsHistory(userId, active);
        return rows.map((r) => ({ x: new Date(r.achievedAt).getTime(), y: r.reps }));
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

  const chartCaption =
    metric === 'volume'
      ? 'Best volume per session'
      : metric === 'reps'
        ? 'Most reps per session'
        : 'Heaviest weight per session';
  // Reps have no unit; weight/volume read out in the profile unit.
  const scrubUnit = metric === 'reps' ? 'reps' : units;

  // Stat tiles read the all-time records straight off the PR cache. Heaviest
  // leads — it is THE record (2026-08-09 spec); reps cover bodyweight work.
  const activeGroup = prs?.find((p) => p.exerciseId === active) ?? null;
  const heaviest = activeGroup?.records.find((r) => r.type === 'heaviest_weight') ?? null;
  const mostReps = activeGroup?.records.find((r) => r.type === 'most_reps') ?? null;
  const invertedInk = resolvePlateStyles(theme, { tone: 'inverted' }).ink;

  // A bodyweight-only exercise has nothing to plot on the weight or volume
  // series — land it on the Reps metric instead of an empty chart.
  useEffect(() => {
    if (activeGroup && !activeGroup.records.some((r) => r.type === 'heaviest_weight')) {
      setMetric('reps');
    }
  }, [activeGroup]);

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* the screen's one display moment — tab headers are gone */}
        <View style={[styles.pad, styles.headerRow]}>
          <SettleSlam>
            <Text variant="displayXL" color={theme.color.inkHero}>
              Progress
            </Text>
          </SettleSlam>
          <SyncIndicator />
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.space.s10 }} />
        ) : (prs?.length ?? 0) === 0 ? (
          <View style={[styles.pad, styles.emptyWrap]}>
            <EmptyState
              title="No personal records yet."
              hint="Complete a few sets and your personal records will show up here."
            />
          </View>
        ) : (
          <>
            {/* exercise selector — carries the screen's one eyebrow */}
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Charted exercise: ${activeName || 'none'}. Tap to change.`}
              style={({ pressed }) => [
                styles.pad,
                styles.exerciseSelect,
                pressed && styles.pressed,
              ]}
            >
              <Text variant="label" color={theme.color.inkTertiary}>
                Exercise
              </Text>
              <View style={styles.exerciseSelectRow}>
                <Text variant="title" color={theme.color.ink} numberOfLines={1} style={styles.flex}>
                  {activeName || 'Select exercise'}
                </Text>
                <Icon name="chevron-down" size={18} color={theme.color.inkSecondary} />
              </View>
            </Pressable>

            {/* 2-col stat tiles: inverted panels, mono numerals, mono-caps
                strip captions (panel ink at 0.65 — the inverted exception) */}
            {heaviest || mostReps ? (
              <View style={[styles.pad, styles.tileRow]}>
                {heaviest ? (
                  <Plate tone="inverted" style={styles.tile} faceStyle={styles.tileFace}>
                    <Text variant="strip" color={invertedInk} style={styles.tileCaption}>
                      Heaviest
                    </Text>
                    <Text variant="numeralLg" color={invertedInk}>
                      {heaviest.displayValue} {units}
                    </Text>
                    <Text variant="strip" color={invertedInk} style={styles.tileCaption}>
                      {formatRelativeDate(heaviest.achievedAt)}
                    </Text>
                  </Plate>
                ) : null}
                {mostReps ? (
                  <Plate tone="inverted" style={styles.tile} faceStyle={styles.tileFace}>
                    <Text variant="strip" color={invertedInk} style={styles.tileCaption}>
                      Most reps
                    </Text>
                    {/* displayValue is self-contained ("15 BW" / "12 × 80 kg") — no extra suffix */}
                    <Text variant="numeralLg" color={invertedInk}>
                      {mostReps.displayValue}
                    </Text>
                    <Text variant="strip" color={invertedInk} style={styles.tileCaption}>
                      {formatRelativeDate(mostReps.achievedAt)}
                    </Text>
                  </Plate>
                ) : null}
              </View>
            ) : null}

            {/* scrub read-out replaces the metric caption while scrubbing */}
            <Text variant="strip" color={theme.color.inkTertiary} style={styles.pad}>
              {scrubbed
                ? `${formatShortDate(new Date(scrubbed.x).toISOString())} · ${trim(scrubbed.y)} ${scrubUnit}`
                : chartCaption}
            </Text>

            {/* full-bleed chart: volt line, ink PR rings, accentSoft fill */}
            <LineChart
              data={series}
              width={windowWidth}
              height={208}
              markers={markers}
              onScrub={setScrubbed}
              scrubX={scrubbed?.x ?? null}
              xTickFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              }
            />

            {/* range + metric controls (Segment: inversion = selected) */}
            <View style={[styles.pad, styles.controls]}>
              <Segment
                size="sm"
                options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
                value={range}
                onChange={setRange}
              />
              <Segment
                size="sm"
                options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
                value={metric}
                onChange={(m) => {
                  setMetric(m);
                  setScrubbed(null);
                }}
              />
            </View>

            <View style={[styles.pad, styles.section]}>
              {/* The ONE section-header treatment: strip caps + hairline rule below. */}
              <View style={styles.sectionHeader}>
                <Text variant="strip" color={theme.color.inkTertiary}>
                  Personal records
                </Text>
              </View>
              {(prs ?? []).map((g, i) => {
                const isActive = g.exerciseId === active;
                const rowInk = isActive ? invertedInk : theme.color.ink;
                const rowMeta = isActive ? invertedInk : theme.color.inkTertiary;
                return (
                  <FadeInView key={g.exerciseId} delay={staggerDelay(i)}>
                    <Plate
                      onPress={() => {
                        setSelectedExercise(g.exerciseId);
                        setSelectedExerciseName(g.exerciseName);
                        setScrubbed(null);
                      }}
                      tone={isActive ? 'inverted' : 'panel'}
                      accessibilityRole="button"
                      accessibilityLabel={`${g.exerciseName} records. Tap to chart.`}
                      accessibilityState={{ selected: isActive }}
                      faceStyle={styles.prFace}
                    >
                      <View style={styles.flex}>
                        <Text variant="card" color={rowInk}>
                          {g.exerciseName}
                        </Text>
                        <Text
                          variant="strip"
                          color={rowMeta}
                          numberOfLines={1}
                          style={[styles.prStrip, isActive && styles.softInk]}
                        >
                          {g.records
                            // Honest fallback: an unrecognized record type (e.g. a
                            // retired type not yet swept) humanizes rather than
                            // showing the raw snake_case enum (impeccable batch 5).
                            .map(
                              (r) =>
                                `${PR_LABEL[r.type] ?? humanizeEnum(r.type)} ${r.displayValue}`,
                            )
                            .join(' · ')}
                        </Text>
                      </View>
                      {g.hasRecent ? (
                        <View
                          style={[styles.recentDot, isActive && { backgroundColor: invertedInk }]}
                        />
                      ) : null}
                      <Text variant="strip" color={rowMeta} style={isActive && styles.softInk}>
                        {/* records are precedence-ordered, so take the latest date explicitly */}
                        {g.records.length
                          ? formatRelativeDate(
                              g.records.reduce(
                                (a, r) => (r.achievedAt > a ? r.achievedAt : a),
                                g.records[0]!.achievedAt,
                              ),
                            )
                          : ''}
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
    // Horizontal padding lives on each block (styles.pad) instead of the
    // scroll container so the chart can run full-bleed between them.
    scroll: {
      paddingVertical: theme.space.page,
      gap: theme.space.s4,
      paddingBottom: theme.space.s12,
    },
    pad: { paddingHorizontal: theme.space.page },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: theme.space.s3,
    },
    flex: { flex: 1 },
    pressed: { opacity: 0.7 },

    exerciseSelect: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      gap: theme.space.half,
    },
    exerciseSelectRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s2 },

    tileRow: { flexDirection: 'row', gap: theme.space.s3 },
    tile: { flex: 1 },
    tileFace: { padding: theme.space.s4, gap: theme.space.s1 },
    tileCaption: { opacity: 0.65 },

    controls: { gap: theme.space.s2 },

    section: { gap: theme.space.s2, marginTop: theme.space.s2 },
    // The ONE section-header treatment: strip caps + a single hairline below.
    sectionHeader: {
      paddingBottom: theme.space.s3,
      borderBottomWidth: theme.depth.hairline,
      borderBottomColor: theme.color.border,
    },

    prFace: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s3,
      padding: theme.space.s4,
    },
    prStrip: { marginTop: theme.space.s1 },
    recentDot: {
      width: 7,
      height: 7,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.accent,
    },
    softInk: { opacity: 0.65 },

    emptyWrap: { marginTop: theme.space.s8 },
  });
