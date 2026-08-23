import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { formatDuration, formatRowDate, getDateGroup } from '@/core/format';
import { useHistoryInfinite, workoutDayAnchor, type HistoryRow } from '@/queries/history';
import { triggerPull } from '@/sync/engine';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { SettleSlam } from '@/ui/SettleSlam';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

/**
 * Rows past this index mount with the capped cascade delay, so rows revealed
 * by scrolling or pagination don't queue up ever-longer entrances.
 */
const STAGGER_CAP = 8;

export default function HistoryScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const historyQuery = useHistoryInfinite(userId);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const rows = useMemo<HistoryRow[]>(() => {
    return historyQuery.data?.pages.flat() ?? [];
  }, [historyQuery.data]);

  const sections = useMemo(() => {
    const groups = new Map<string, HistoryRow[]>();
    for (const w of rows) {
      // #155: day attribution anchors on started_at (see workoutDayAnchor).
      const key = getDateGroup(workoutDayAnchor(w));
      const bucket = groups.get(key) ?? [];
      bucket.push(w);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [rows]);

  const delayById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, i) => map.set(row.id, staggerDelay(Math.min(i, STAGGER_CAP))));
    return map;
  }, [rows]);

  const renderItem = useCallback(
    // `index` is within the section: the first row under a month header drops
    // its own top rule (the header's rule below is THE rule).
    ({ item, index }: { item: HistoryRow; index: number }) => (
      <HistoryItem row={item} first={index === 0} delay={delayById.get(item.id) ?? 0} />
    ),
    [delayById],
  );

  const onEndReached = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
      void historyQuery.fetchNextPage();
    }
  }, [historyQuery]);

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={historyQuery.isRefetching}
            onRefresh={async () => {
              await triggerPull();
              await historyQuery.refetch();
            }}
          />
        }
        ListHeaderComponent={
          // Chrome title moved in-screen (Anton display, matching Progress/
          // Profile) — the nav header now carries only the back chevron
          // (impeccable batch 5).
          <View style={styles.headerRow}>
            <SettleSlam style={styles.title}>
              <Text variant="displayXL" color={theme.color.inkHero}>
                History
              </Text>
            </SettleSlam>
            <SyncIndicator />
          </View>
        }
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              <EmptyState title="No workouts logged yet." />
            </View>
          )
        }
        ListFooterComponent={
          historyQuery.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footerLoading} />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="strip" color={theme.color.inkTertiary}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={renderItem}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
      />
    </SafeAreaView>
  );
}

function HistoryItem({ row, first, delay }: { row: HistoryRow; first: boolean; delay: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const setNoun = row.set_count === 1 ? 'set' : 'sets';
  const exerciseNoun = row.exercise_count === 1 ? 'exercise' : 'exercises';
  const duration = formatDuration(row.started_at, row.ended_at);
  // #155: same started_at anchor the month sections group by — the row date
  // and its section can never disagree.
  const rowDate = formatRowDate(row.started_at);
  const strip = [
    `${row.completed_set_count}/${row.set_count} ${setNoun}`,
    `${row.exercise_count} ${exerciseNoun}`,
    ...(row.volume > 0 ? [`${Math.round(row.volume)} vol`] : []),
    // Every row here comes from a finished workout (the query filters
    // ended_at IS NOT NULL), so duration is always present — the null case
    // is only a type-level honesty, not a reachable path (impeccable batch 5).
    ...(duration ? [duration] : []),
  ].join(' · ');

  return (
    <FadeInView delay={delay}>
      <Plate
        tone="ghost"
        onPress={() => router.push(`/history/${row.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`View workout ${row.title}`}
        style={[styles.row, first && styles.rowFirst]}
        faceStyle={styles.rowFace}
      >
        <View style={styles.titleRow}>
          <Text variant="card" color={theme.color.ink} style={styles.titleText} numberOfLines={1}>
            {row.title}
          </Text>
          <Text variant="strip" color={theme.color.inkTertiary} style={styles.dateText}>
            {rowDate}
          </Text>
        </View>
        <Text variant="strip" color={theme.color.inkTertiary}>
          {strip}
        </Text>
      </Plate>
    </FadeInView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { padding: theme.space.page, paddingBottom: theme.space.s12 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.space.s3,
      marginBottom: theme.space.s4,
    },
    title: { flex: 1 },
    // The ONE section-header treatment: strip caps + a single hairline below.
    sectionHeader: {
      marginTop: theme.space.s6,
      paddingBottom: theme.space.s3,
      borderBottomWidth: theme.depth.hairline,
      borderBottomColor: theme.color.border,
    },
    row: {
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    // The header's rule below already separates the first row.
    rowFirst: { borderTopWidth: 0 },
    rowFace: {
      paddingVertical: theme.space.s3,
      gap: theme.space.s1,
    },
    // Title + anchored date (row-squaring fix): the date pins the right edge
    // of line 1 so rows read as equal-width bands even though the strip
    // below still varies in length.
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: theme.space.s3,
    },
    titleText: { flexShrink: 1 },
    dateText: { flexShrink: 0 },
    loading: { marginTop: theme.space.s10 },
    footerLoading: { marginVertical: theme.space.s4 },
    empty: {
      marginTop: theme.space.s10,
    },
  });
