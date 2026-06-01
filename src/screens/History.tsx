import { router } from 'expo-router';
import { safeRoute } from '@/lib/safeRoute';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { formatDuration, getDateGroup } from '@/core/format';
import { useHistoryInfinite, type HistoryRow } from '@/queries/history';
import { triggerPull } from '@/sync/engine';
import { SyncIndicator } from '@/ui/SyncIndicator';
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
            <Text style={styles.title}>History</Text>
            <SyncIndicator />
          </View>
        }
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <ActivityIndicator style={{ marginTop: theme.space.s10 }} />
          ) : (
            <Text style={styles.empty}>No workouts logged yet.</Text>
          )
        }
        ListFooterComponent={
          historyQuery.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: theme.space.s4 }} />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
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
    <Pressable
      onPress={() => router.push(safeRoute(`/history/${row.id}`))}
      accessibilityRole="button"
      accessibilityLabel={`View workout ${row.title}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowMeta}>
          {row.completed_set_count}/{row.set_count} sets · {row.exercise_count} exercises
          {row.volume > 0 ? ` · ${Math.round(row.volume)} vol` : ''}
        </Text>
      </View>
      <Text style={styles.rowDuration}>{formatDuration(row.started_at, row.ended_at)}</Text>
    </Pressable>
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
  title: {
    flex: 1,
    fontSize: theme.font.size.display,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
    letterSpacing: -0.5,
  },
  sectionHeader: {
    fontSize: theme.font.size.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: theme.color.inkTertiary,
    fontWeight: theme.font.weight.medium,
    marginTop: theme.space.s4,
    marginBottom: theme.space.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  rowTitle: {
    fontSize: theme.font.size.body,
    fontWeight: theme.font.weight.medium,
    color: theme.color.ink,
  },
  rowMeta: { fontSize: theme.font.size.meta, color: theme.color.inkSecondary, marginTop: 2 },
  rowDuration: {
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    textAlign: 'center',
    color: theme.color.inkSecondary,
    marginTop: theme.space.s10,
  },
  });
