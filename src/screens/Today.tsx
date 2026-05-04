import { router } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { formatDuration, formatRelativeDate, getGreeting } from '@/core/format';
import { useActiveWorkout, useCreateWorkout, useRecentWorkouts } from '@/queries/workouts';
import { triggerPull } from '@/sync/engine';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { useToast } from '@/ui/ToastContext';
import { theme } from '@/ui/theme';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const activeQuery = useActiveWorkout(userId);
  const recentQuery = useRecentWorkouts(userId, 5);
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const createWorkout = useCreateWorkout(toastError);

  const onRefresh = useCallback(async () => {
    await triggerPull();
    await Promise.all([activeQuery.refetch(), recentQuery.refetch()]);
  }, [activeQuery, recentQuery]);

  const onStart = useCallback(async () => {
    if (!userId) return;
    const id = await createWorkout.mutateAsync({ userId, title: 'Workout' });
    void id;
    router.push('/workout/active');
  }, [createWorkout, userId]);

  if (!userId) return null;

  const active = activeQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isRefetching || recentQuery.isRefetching}
            onRefresh={onRefresh}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.title}>Today</Text>
          </View>
          <SyncIndicator />
        </View>

        {active ? (
          <Pressable
            onPress={() => router.push('/workout/active')}
            style={({ pressed }) => [styles.activeCard, pressed && styles.cardPressed]}
          >
            <Text style={styles.activeLabel}>Workout in progress</Text>
            <Text style={styles.activeTitle}>{active.title}</Text>
            <Text style={styles.activeMeta}>
              Started {formatRelativeDate(active.started_at).toLowerCase()}
            </Text>
            <View style={styles.resumeButton}>
              <Text style={styles.resumeText}>Resume</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={onStart}
            disabled={createWorkout.isPending}
            style={({ pressed }) => [styles.startCard, pressed && styles.cardPressed]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.startTitle}>Start a workout</Text>
              <Text style={styles.startBody}>Build it as you go, or follow a template.</Text>
            </View>
            {createWorkout.isPending ? (
              <ActivityIndicator color={theme.color.onAccent} />
            ) : (
              <Text style={styles.startArrow}>→</Text>
            )}
          </Pressable>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recentQuery.isLoading ? (
            <ActivityIndicator color={theme.color.textSecondary} />
          ) : recentQuery.data && recentQuery.data.length > 0 ? (
            recentQuery.data.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => router.push(`/history/${w.id}` as never)}
                style={({ pressed }) => [styles.recentRow, pressed && styles.cardPressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle}>{w.title}</Text>
                  <Text style={styles.recentMeta}>{formatRelativeDate(w.started_at)}</Text>
                </View>
                <Text style={styles.recentDuration}>
                  {formatDuration(w.started_at, w.ended_at)}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>
              No workouts yet. Tap &quot;Start a workout&quot; above to begin.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s5, paddingBottom: theme.space.s12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
  greeting: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    marginBottom: theme.space.s1,
  },
  title: {
    fontSize: theme.font.display,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
    letterSpacing: -0.5,
  },
  activeCard: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.lg,
    padding: theme.space.s5,
    gap: theme.space.s2,
  },
  activeLabel: {
    fontSize: theme.font.micro,
    color: theme.color.onAccent,
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTitle: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.onAccent,
  },
  activeMeta: { fontSize: theme.font.meta, color: theme.color.onAccent, opacity: 0.75 },
  resumeButton: {
    alignSelf: 'flex-start',
    marginTop: theme.space.s3,
    paddingHorizontal: theme.space.s4,
    paddingVertical: theme.space.s2,
    backgroundColor: theme.color.onAccent,
    borderRadius: theme.radius.full,
  },
  resumeText: {
    color: theme.color.text,
    fontSize: theme.font.meta,
    fontWeight: theme.font.weight.semibold,
  },
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.lg,
    padding: theme.space.s5,
    gap: theme.space.s3,
  },
  startTitle: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.onAccent,
  },
  startBody: {
    fontSize: theme.font.meta,
    color: theme.color.onAccent,
    opacity: 0.75,
    marginTop: theme.space.s1,
  },
  startArrow: {
    fontSize: 28,
    color: theme.color.onAccent,
    opacity: 0.9,
  },
  cardPressed: { opacity: 0.85 },
  section: { gap: theme.space.s3 },
  sectionTitle: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.s4,
    paddingHorizontal: theme.space.s4,
    gap: theme.space.s3,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  recentTitle: {
    fontSize: theme.font.body,
    fontWeight: theme.font.weight.medium,
    color: theme.color.text,
  },
  recentMeta: { fontSize: theme.font.meta, color: theme.color.textSecondary },
  recentDuration: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    fontSize: theme.font.body,
    color: theme.color.textSecondary,
    padding: theme.space.s4,
    textAlign: 'center',
  },
});
