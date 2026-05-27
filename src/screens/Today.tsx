import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RepeatCard } from '@/components/RepeatCard';
import {
  useLastFinishedWorkoutWithSeeds,
  useRepeatLastWorkout,
} from '@/queries/repeatLastWorkout';
import { useActiveWorkout, useRecentWorkouts, useCreateWorkout } from '@/queries/workouts';
import { useToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const activeQuery = useActiveWorkout(userId);
  const lastFinishedQuery = useLastFinishedWorkoutWithSeeds(userId);
  const recentQuery = useRecentWorkouts(userId, 3);
  const repeat = useRepeatLastWorkout(userId, toastError);
  const createWorkout = useCreateWorkout(toastError);

  const greeting = useMemo(() => greetingFor(new Date()), []);

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
      <ScrollView contentContainerStyle={styles.scroll}>
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

        {activeQuery.data ? (
          <ResumeCard onPress={onResume} />
        ) : lastFinishedQuery.isLoading ? (
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
            onPress={() => router.push('/profile/plan' as never)}
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
    paddingVertical: 14,
  },
});
