import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/useAuth';
import { greetingFor, localDaysBetween } from '@/core/format';
import { CollisionSheet } from '@/components/CollisionSheet';
import { QuarantineBanner } from '@/components/QuarantineBanner';
import { QuarantineSheet } from '@/components/QuarantineSheet';
import { RepeatCard } from '@/components/RepeatCard';
import { SyncDiagnosticsSheet } from '@/components/SyncDiagnosticsSheet';
import { useLastFinishedWorkoutWithSeeds, useRepeatLastWorkout } from '@/queries/repeatLastWorkout';
import { finishOtherActiveWorkouts, useActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { queryKeys } from '@/queries/keys';
import {
  useActiveWorkout,
  useRecentWorkouts,
  useCreateWorkout,
  deleteWorkoutLocal,
} from '@/queries/workouts';
import { getCachedSnapshot, persistSnapshot, type TodaySnapshot } from '@/ui/todaySnapshot';
import { getStaleQuarantined, useQuarantined } from '@/sync/quarantine';
import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { Button } from '@/ui/Button';
import { FadeInView } from '@/ui/FadeInView';
import { Icon } from '@/ui/icons';
import { FBarMark } from '@/ui/Logo';
import { staggerDelay } from '@/ui/motion';
import { OutlineDisplay } from '@/ui/OutlineDisplay';
import { Plate } from '@/ui/Plate';
import { resolvePlateStyles } from '@/ui/plateStyles';
import { SettleSlam } from '@/ui/SettleSlam';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/ToastContext';
import { useTheme, type Theme } from '@/ui/useTheme';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const qc = useQueryClient();
  const activeQuery = useActiveWorkout(userId);
  const lastFinishedQuery = useLastFinishedWorkoutWithSeeds(userId);
  const recentQuery = useRecentWorkouts(userId, 3);
  const repeat = useRepeatLastWorkout(userId, toastError);
  const createWorkout = useCreateWorkout(toastError);
  const collisionsQuery = useActiveWorkoutCollisions(userId);
  const hasCollision = (collisionsQuery.data?.workouts.length ?? 0) >= 2;
  // #111: the sheet is dismissable, but only for THIS set of colliding
  // workouts — a different collision set shows the sheet again. Derived, so no
  // reset effect is needed.
  const collisionKey = (collisionsQuery.data?.workouts ?? [])
    .map((w) => w.id)
    .sort()
    .join(',');
  const [dismissedCollisionKey, setDismissedCollisionKey] = useState<string | null>(null);
  const collisionVisible = hasCollision && dismissedCollisionKey !== collisionKey;

  const quarantinedQuery = useQuarantined();
  const staleQuarantined = useMemo(
    () => (quarantinedQuery.data ? getStaleQuarantined(quarantinedQuery.data) : []),
    [quarantinedQuery.data],
  );
  const [quarantineSheetOpen, setQuarantineSheetOpen] = useState(false);

  // Sync-failure surface (backlog 8.3): palette-native, actionable — tapping it
  // opens the sync diagnostics sheet instead of a mute 1px stripe.
  const sync = useSyncStateLive();
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const syncTrouble = sync.lastErrorAt !== null && sync.pendingOutbox > 0;
  const syncLabel =
    sync.pendingOutbox === 1
      ? '1 change waiting to sync'
      : `${sync.pendingOutbox} changes waiting to sync`;

  const onCollisionResume = useCallback(
    async (workoutId: string) => {
      if (!userId) return;
      // #111: the other unfinished workouts are real training — mark them
      // finished (ended_at = now), never silently discard them.
      await finishOtherActiveWorkouts(userId, workoutId);
      qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      qc.invalidateQueries({ queryKey: queryKeys.history(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.personalRecords(userId) });
      router.push('/workout/active');
    },
    [userId, qc],
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
    if (activeQuery.isLoading || lastFinishedQuery.isLoading || recentQuery.isLoading) {
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
    // No explicit title — createWorkout defaults it to the day of week (1.6).
    await createWorkout.mutateAsync({ userId });
    router.push('/workout/active');
  }, [createWorkout, userId]);

  if (!userId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <FBarMark size={60} />
          <Pressable
            onPress={() => router.push('/history')}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Open workout history"
            style={({ pressed }) => [styles.historyLink, pressed && styles.historyLinkPressed]}
          >
            <Text variant="meta" color={theme.color.inkTertiary}>
              History
            </Text>
            <Icon name="arrow-right" size={14} color={theme.color.inkTertiary} />
          </Pressable>
        </View>

        {/* Quiet-danger sync surface — the ONE treatment shared with
            QuarantineBanner: panel plate, danger hairline, danger text, no
            danger fill. Functionally separate from quarantine (different tap). */}
        {syncTrouble ? (
          <Plate
            tone="panel"
            border="soft"
            onPress={() => setSyncSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${syncLabel}, tap for sync details`}
            style={styles.syncRow}
            faceStyle={styles.syncFace}
          >
            <Text variant="meta" color={theme.color.danger}>
              {syncLabel} · Details
            </Text>
          </Plate>
        ) : null}

        <Text variant="label" color={theme.color.inkTertiary} style={styles.greet}>
          {greeting}
        </Text>
        <SettleSlam style={styles.headline}>
          {activeQuery.data ? (
            <>
              <Text
                variant="displayXXL"
                color={theme.color.inkHero}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Back to
              </Text>
              <Text
                variant="displayXXL"
                color={theme.color.inkHero}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Work.
              </Text>
            </>
          ) : (
            <>
              <Text
                variant="displayXXL"
                color={theme.color.inkHero}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Ready to
              </Text>
              <OutlineDisplay size="displayXXL">Lift.</OutlineDisplay>
            </>
          )}
        </SettleSlam>

        <QuarantineBanner
          staleCount={staleQuarantined.length}
          onPress={() => setQuarantineSheetOpen(true)}
        />

        <FadeInView>
          {activeQuery.data ? (
            <ResumeCard onPress={onResume} />
          ) : lastFinishedQuery.isLoading &&
            initialSnapshot?.state === 'repeat' &&
            initialSnapshot.repeatSeeds ? (
            <RepeatCard
              title={initialSnapshot.repeatTitle ?? 'Workout'}
              daysAgo={initialSnapshot.repeatDaysAgo ?? 0}
              seeds={initialSnapshot.repeatSeeds}
              loading
              onPress={() => {
                /* no-op until live data lands */
              }}
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
            <EmptyRepeatSlot onBlankStart={onBlankStart} loading={createWorkout.isPending} />
          )}
        </FadeInView>

        <View style={styles.ghostRow}>
          <Button
            label="Blank workout"
            kind="ghost"
            size="row"
            icon="plus"
            onPress={onBlankStart}
            disabled={createWorkout.isPending || !!activeQuery.data}
            accessibilityLabel="Start a blank workout"
            accessibilityHint="Begin a new workout with no exercises"
          />
          <Button
            label="Training plan"
            kind="ghost"
            size="row"
            onPress={() => router.push('/profile/plan')}
            accessibilityLabel="Open training plan"
          />
        </View>

        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text variant="strip" color={theme.color.inkTertiary}>
              Recent
            </Text>
          </View>
          {recentQuery.data?.length ? (
            recentQuery.data.map((w, i) => (
              <FadeInView key={w.id} delay={staggerDelay(i)}>
                <View
                  style={styles.recentRow}
                  accessibilityLabel={`${w.title || 'Workout'}, ${recentMeta(w).toLowerCase()}`}
                >
                  <Text variant="card" color={theme.color.ink}>
                    {w.title || 'Workout'}
                  </Text>
                  <Text variant="strip" color={theme.color.inkTertiary}>
                    {recentMeta(w)}
                  </Text>
                </View>
              </FadeInView>
            ))
          ) : (
            <Text variant="meta" color={theme.color.inkTertiary} style={styles.recentEmpty}>
              Nothing here yet.
            </Text>
          )}
        </View>
      </ScrollView>
      <CollisionSheet
        visible={collisionVisible}
        workouts={collisionsQuery.data?.workouts ?? []}
        details={collisionsQuery.data?.details ?? new Map()}
        onResume={onCollisionResume}
        onDiscard={onCollisionDiscard}
        onClose={() => setDismissedCollisionKey(collisionKey)}
      />
      <QuarantineSheet
        visible={quarantineSheetOpen}
        rows={quarantinedQuery.data ?? []}
        onClose={() => setQuarantineSheetOpen(false)}
        onChanged={() => qc.invalidateQueries({ queryKey: ['outbox', 'quarantined'] })}
      />
      <SyncDiagnosticsSheet
        visible={syncSheetOpen}
        onClose={() => setSyncSheetOpen(false)}
        onOpenQuarantine={() => {
          setSyncSheetOpen(false);
          setQuarantineSheetOpen(true);
        }}
      />
    </SafeAreaView>
  );
}

function ResumeCard({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const ink = useMemo(() => resolvePlateStyles(theme, { tone: 'inverted' }).ink, [theme]);
  return (
    <Plate
      tone="inverted"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Resume workout in progress"
      style={styles.card}
      faceStyle={styles.resumeFace}
    >
      {/* Inverted panel: strip keeps the panel ink at 0.65 opacity. */}
      <Text variant="strip" color={ink} style={styles.monoStrip}>
        In progress
      </Text>
      <Text variant="title" color={ink}>
        Resume workout
      </Text>
      <View style={styles.resumeCta}>
        <Text variant="card" color={ink} style={styles.resumeCtaLabel}>
          Resume
        </Text>
        <Icon name="arrow-right" size={16} color={ink} />
      </View>
    </Plate>
  );
}

function EmptyRepeatSlot({
  onBlankStart,
  loading,
}: {
  onBlankStart: () => void;
  loading: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.emptyWrap}>
      <Button
        label="Start your first workout"
        kind="primary"
        size="cta"
        icon="arrow-right"
        loading={loading}
        onPress={onBlankStart}
        accessibilityLabel="Start your first workout"
        accessibilityHint="Begin a new workout with no exercises"
      />
      <Text variant="meta" color={theme.color.inkTertiary} style={styles.emptyHint}>
        Your sessions will live here once you start lifting.
      </Text>
    </View>
  );
}

function daysSince(iso: string): number {
  // Calendar days, not rolling 24h windows, so the Repeat card agrees with
  // History about whether a session was "today" / "yesterday" (#150).
  return Math.max(0, localDaysBetween(iso));
}

function recentMeta(w: { started_at: string; ended_at: string | null }): string {
  // Sentence case — the strip variant handles the uppercasing.
  const d = daysSince(w.started_at);
  return d === 0 ? 'Today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { paddingTop: theme.space.s2, paddingBottom: theme.space.section * 2 },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.page,
      paddingTop: theme.space.s2,
    },
    historyLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s1,
      minHeight: theme.touch.min,
    },
    historyLinkPressed: { opacity: 0.6 },
    syncRow: {
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s2,
    },
    syncFace: {
      paddingVertical: theme.space.s3,
      paddingHorizontal: theme.space.s4,
      minHeight: theme.touch.min,
      justifyContent: 'center',
      // border="soft" supplies the hairline weight; danger recolors it.
      borderColor: theme.color.danger,
    },
    greet: {
      paddingHorizontal: theme.space.page,
      paddingTop: theme.space.s4,
      paddingBottom: theme.space.s1,
    },
    headline: {
      paddingHorizontal: theme.space.page,
      paddingBottom: theme.space.s6,
    },
    cardSkeleton: {
      marginHorizontal: theme.space.s4,
      paddingVertical: theme.space.s10,
      alignItems: 'center',
    },
    card: { marginHorizontal: theme.space.s4 },
    resumeFace: { padding: theme.space.s5, gap: theme.space.s2 },
    monoStrip: { opacity: 0.65 },
    resumeCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s1,
      marginTop: theme.space.s2,
    },
    resumeCtaLabel: {
      fontFamily: theme.font.family.sansSemibold,
    },
    emptyWrap: {
      marginHorizontal: theme.space.s4,
      gap: theme.space.s3,
    },
    emptyHint: { textAlign: 'center' },
    ghostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: theme.space.s4,
      paddingHorizontal: theme.space.s4,
      marginTop: theme.space.s2,
    },
    recentSection: {
      marginTop: theme.space.section,
      paddingHorizontal: theme.space.page,
    },
    recentHeader: {
      paddingBottom: theme.space.s3,
      borderBottomWidth: theme.depth.hairline,
      borderBottomColor: theme.color.border,
    },
    recentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingVertical: theme.space.s4,
    },
    recentEmpty: {
      paddingVertical: theme.space.s4,
    },
  });
