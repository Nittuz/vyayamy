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
import { useHistoryInfinite, type HistoryRow } from '@/queries/history';
import { triggerPull } from '@/sync/engine';
import { Plate } from '@/ui/Plate';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

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
      const key = getDateGroup(w.started_at);
      const bucket = groups.get(key) ?? [];
      bucket.push(w);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [rows]);

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
          <View style={styles.headerRow}>
            <Text variant="display" color={theme.color.ink} style={styles.title}>
              History
            </Text>
            <SyncIndicator />
          </View>
        }
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <Text variant="meta" color={theme.color.inkSecondary} style={styles.empty}>
              No workouts logged yet.
            </Text>
          )
        }
        ListFooterComponent={
          historyQuery.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footerLoading} />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text variant="label" color={theme.color.inkTertiary} style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        renderItem={renderItem}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
      />
    </SafeAreaView>
  );
}

const renderItem = ({ item }: { item: HistoryRow }) => <HistoryItem row={item} />;

function HistoryItem({ row }: { row: HistoryRow }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Plate
      offset="sm"
      onPress={() => router.push(`/history/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`View workout ${row.title}`}
      style={styles.row}
      faceStyle={styles.rowFace}
    >
      <View style={styles.rowBody}>
        <Text variant="card" color={theme.color.ink}>
          {row.title}
        </Text>
        <Text variant="meta" color={theme.color.inkSecondary}>
          {row.completed_set_count}/{row.set_count} sets · {row.exercise_count} exercises
          {row.volume > 0 ? ` · ${Math.round(row.volume)} vol` : ''}
        </Text>
      </View>
      <Text variant="numeral" color={theme.color.inkSecondary}>
        {formatDuration(row.started_at, row.ended_at)}
      </Text>
    </Plate>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { padding: theme.space.page, gap: theme.space.s2, paddingBottom: theme.space.s12 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: theme.space.s4,
    },
    title: { flex: 1 },
    sectionHeader: {
      marginTop: theme.space.s4,
      marginBottom: theme.space.s2,
    },
    row: { marginBottom: theme.space.s1 },
    rowFace: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.space.s4,
      gap: theme.space.s3,
    },
    rowBody: { flex: 1, gap: theme.space.half },
    loading: { marginTop: theme.space.s10 },
    footerLoading: { marginVertical: theme.space.s4 },
    empty: {
      textAlign: 'center',
      marginTop: theme.space.s10,
    },
  });
