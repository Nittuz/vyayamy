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
import { formatDuration, getDateGroup } from '@/core/format';
import { useHistoryInfinite, workoutDayAnchor, type HistoryRow } from '@/queries/history';
import { triggerPull } from '@/sync/engine';
import { EmptyState } from '@/ui/EmptyState';
import { FadeInView } from '@/ui/FadeInView';
import { staggerDelay } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
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
          <View style={styles.syncRow}>
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
  const strip = [
    `${row.completed_set_count}/${row.set_count} ${setNoun}`,
    `${row.exercise_count} ${exerciseNoun}`,
    ...(row.volume > 0 ? [`${Math.round(row.volume)} vol`] : []),
    formatDuration(row.started_at, row.ended_at),
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
        <Text variant="card" color={theme.color.ink}>
          {row.title}
        </Text>
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
    syncRow: { flexDirection: 'row', justifyContent: 'flex-end' },
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
    loading: { marginTop: theme.space.s10 },
    footerLoading: { marginVertical: theme.space.s4 },
    empty: {
      marginTop: theme.space.s10,
    },
  });
