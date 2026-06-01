import { router } from 'expo-router';
import { safeRoute } from '@/lib/safeRoute';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/useAuth';
import { CollisionSheet } from '@/components/CollisionSheet';
import { QuarantineBanner } from '@/components/QuarantineBanner';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { QuarantineSheet } from '@/components/QuarantineSheet';
import { RepeatCard } from '@/components/RepeatCard';
import {
  useLastFinishedWorkoutWithSeeds,
  useRepeatLastWorkout,
} from '@/queries/repeatLastWorkout';
import { useActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { queryKeys } from '@/queries/keys';
import { useActiveWorkout, useRecentWorkouts, useCreateWorkout, deleteWorkoutLocal } from '@/queries/workouts';
import {
  getCachedSnapshot,
  persistSnapshot,
  type TodaySnapshot,
} from '@/ui/todaySnapshot';
import { getStaleQuarantined, useQuarantined } from '@/sync/quarantine';
import { useToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const qc = useQueryClient();
  const activeQuery = useActiveWorkout(userId);
  const lastFinishedQuery = useLastFinishedWorkoutWithSeeds(userId);
  const recentQuery = useRecentWorkouts(userId, 3);
  const repeat = useRepeatLastWorkout(userId, toastError);
  const createWorkout = useCreateWorkout(toastError);
  const collisionsQuery = useActiveWorkoutCollisions(userId);
  const hasCollision = (collisionsQuery.data?.workouts.length ?? 0) >= 2;

  const quarantinedQuery = useQuarantined();
  const staleQuarantined = useMemo(
    () => (quarantinedQuery.data ? getStaleQuarantined(quarantinedQuery.data) : []),
    [quarantinedQuery.data],
  );
  const [quarantineSheetOpen, setQuarantineSheetOpen] = useState(false);

  const onCollisionResume = useCallback(
    async (workoutId: string) => {
      if (!collisionsQuery.data) return;
      const toDiscard = collisionsQuery.data.workouts
        .map((w) => w.id)
        .filter((id) => id !== workoutId);
      for (const id of toDiscard) {
        // eslint-disable-next-line no-await-in-loop
        await deleteWorkoutLocal(id);
      }
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      router.push('/workout/active');
    },
    [collisionsQuery.data, qc],
  );

  const onCollisionDiscard = useCallback(
    async (workoutId: string) => {
      await deleteWorkoutLocal(workoutId);
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    [qc],
  );

  const greeting = useMemo(() => greetingFor(new Date()), []);

  // Read the snapshot synchronously at first paint. After live queries land
  // they override the snapshot view via the normal rendering paths.
  const initialSnapshot = useRef(getCachedSnapshot()).current;

  // Persist a fresh snapshot whenever all three source queries settle.
  useEffect(() => {
    if (
      activeQuery.isLoading ||
      lastFinishedQuery.isLoading ||
      recentQuery.isLoading
    ) {
      return;
    }
    const state: TodaySnapshot['state'] = activeQuery.data
      ? 'active'
      : lastFinishedQuery.data
        ? 'repeat'
        : 'empty';
    const recent = (recentQuery.data ?? []).map((w) => ({
      id: w.id,
      title: w.title || 'Workout',
      daysAgo: daysSince(w.started_at),
    }));
    void persistSnapshot({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      state,
      repeatTitle: lastFinishedQuery.data?.workout.title,
      repeatDaysAgo: lastFinishedQuery.data
        ? daysSince(lastFinishedQuery.data.workout.ended_at)
        : undefined,
      repeatSeeds: lastFinishedQuery.data?.seeds,
      recentRows: recent,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // daysSince is a module-scoped pure function — stable reference, safe to omit
  }, [
    activeQuery.isLoading,
    activeQuery.data,
    lastFinishedQuery.isLoading,
    lastFinishedQuery.data,
    recentQuery.isLoading,
    recentQuery.data,
  ]);

  const onRepeat = useCallback(async () => {
    const id = await repeat.mutateAsync();
    if (id) router.push('/workout/active');
  }, [repeat]);

  const onResume = useCallback(() => {
    router.push('/workout/active');
  }, []);

  const onBlankStart = useCallback(async () => {
    if (!userId) return;
    await createWorkout.mutateAsync({ userId, title: 'Workout' });
    router.push('/workout/active');
  }, [createWorkout, userId]);

  if (!userId) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <SyncErrorStripe />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.push('/history')}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.historyLink,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              history →
            </Text>
          </Pressable>
        </View>
        <Text
          style={[
            styles.greet,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.sansMedium,
            },
          ]}
        >
          {greeting.toUpperCase()}
        </Text>
        <Text
          style={[
            styles.titleLine,
            {
              color: theme.color.inkHero,
              fontFamily: theme.font.family.sansSemibold,
              fontSize: theme.font.size.display,
              letterSpacing: theme.font.tracking.display,
            },
          ]}
        >
          {activeQuery.data ? 'Workout in progress.' : 'Ready to lift.'}
        </Text>

        <QuarantineBanner
          staleCount={staleQuarantined.length}
          onPress={() => setQuarantineSheetOpen(true)}
        />

        {activeQuery.data ? (
          <ResumeCard onPress={onResume} />
        ) : lastFinishedQuery.isLoading && initialSnapshot?.state === 'repeat' && initialSnapshot.repeatSeeds ? (
          <RepeatCard
            title={initialSnapshot.repeatTitle ?? 'Workout'}
            daysAgo={initialSnapshot.repeatDaysAgo ?? 0}
            seeds={initialSnapshot.repeatSeeds}
            loading
            onPress={() => {/* no-op until live data lands */}}
          />
        ) : lastFinishedQuery.isLoading && !initialSnapshot ? (
          <View style={styles.cardSkeleton}>
            <ActivityIndicator color={theme.color.inkSecondary} />
          </View>
        ) : lastFinishedQuery.data ? (
          <RepeatCard
            title={lastFinishedQuery.data.workout.title}
            daysAgo={daysSince(lastFinishedQuery.data.workout.ended_at)}
            seeds={lastFinishedQuery.data.seeds}
            loading={repeat.isPending}
            onPress={onRepeat}
          />
        ) : (
          <EmptyRepeatSlot />
        )}

        <View style={styles.altRow}>
          <Pressable
            onPress={onBlankStart}
            disabled={createWorkout.isPending || !!activeQuery.data}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.altBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : activeQuery.data ? 0.3 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.altBtnText,
                { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              + Blank
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(safeRoute('/profile/plan'))}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.altBtn,
              {
                borderColor: theme.color.borderStrong,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.altBtnText,
                { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              Templates
            </Text>
          </Pressable>
        </View>

        <View style={styles.recentSection}>
          <View style={[styles.recentHeader, { borderBottomColor: theme.color.border }]}>
            <Text
              style={[
                styles.recentHeaderText,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              RECENT
            </Text>
          </View>
          {recentQuery.data?.length ? (
            recentQuery.data.map((w) => (
              <View
                key={w.id}
                style={[styles.recentRow, { borderBottomColor: theme.color.border }]}
              >
                <Text
                  style={[
                    styles.recentName,
                    { color: theme.color.ink, fontFamily: theme.font.family.sansMedium },
                  ]}
                >
                  {w.title || 'Workout'}
                </Text>
                <Text
                  style={[
                    styles.recentMeta,
                    { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
                  ]}
                >
                  {recentMeta(w)}
                </Text>
              </View>
            ))
          ) : (
            <Text
              style={[
                styles.recentEmpty,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sans },
              ]}
            >
              Nothing here yet.
            </Text>
          )}
        </View>
      </ScrollView>
      <CollisionSheet
        visible={hasCollision}
        workouts={collisionsQuery.data?.workouts ?? []}
        details={collisionsQuery.data?.details ?? new Map()}
        onResume={onCollisionResume}
        onDiscard={onCollisionDiscard}
      />
      <QuarantineSheet
        visible={quarantineSheetOpen}
        rows={quarantinedQuery.data ?? []}
        onClose={() => setQuarantineSheetOpen(false)}
        onChanged={() => qc.invalidateQueries({ queryKey: ['outbox', 'quarantined'] })}
      />
    </SafeAreaView>
  );
}

function ResumeCard({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.color.accentSoft,
          borderColor: theme.color.accent,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.cardLabel,
          { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        IN PROGRESS
      </Text>
      <Text
        style={[
          styles.cardTitle,
          {
            color: theme.color.inkHero,
            fontFamily: theme.font.family.sansSemibold,
            fontSize: theme.font.size.title,
            letterSpacing: theme.font.tracking.title,
          },
        ]}
      >
        Resume workout
      </Text>
      <Text
        style={[
          styles.cardCta,
          { color: theme.color.accent, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        → Resume
      </Text>
    </Pressable>
  );
}

function EmptyRepeatSlot() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.cardEmpty,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
        },
      ]}
    >
      <Text
        style={[
          styles.cardEmptyBody,
          { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
        ]}
      >
        Your first workout will live here.
      </Text>
    </View>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    now.getDay()
  ];
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return `${day} ${part}`;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
}

function recentMeta(w: { started_at: string; ended_at: string | null }): string {
  const d = daysSince(w.started_at);
  const ago = d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
  return ago;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingTop: 8, paddingBottom: 64 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  historyLink: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  greet: {
    fontSize: 10,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  titleLine: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardSkeleton: {
    marginHorizontal: 16,
    paddingVertical: 40,
    alignItems: 'center',
  },
  cardEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  cardEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  cardLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardTitle: {
    marginBottom: 14,
  },
  cardCta: {
    fontSize: 13,
    fontWeight: '500',
  },
  altRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  altBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  altBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  recentSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  recentHeader: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentHeaderText: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentName: {
    fontSize: 13,
  },
  recentMeta: {
    fontSize: 12,
  },
  recentEmpty: {
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 14,
  },
});
