import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/useAuth';
import { greetingFor, localDaysBetween } from '@/core/format';
import { CollisionSheet } from '@/components/CollisionSheet';
import { ExercisePicker } from '@/components/ExercisePicker';
import { PlanCard } from '@/components/PlanCard';
import { QuarantineBanner } from '@/components/QuarantineBanner';
import { QuarantineSheet } from '@/components/QuarantineSheet';
import { RepeatCard } from '@/components/RepeatCard';
import { SyncDiagnosticsSheet } from '@/components/SyncDiagnosticsSheet';
import { useLastFinishedWorkoutWithSeeds, useRepeatLastWorkout } from '@/queries/repeatLastWorkout';
import { finishOtherActiveWorkouts, useActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { queryKeys } from '@/queries/keys';
import { useStartPlannedWorkout, useTodaySchedule } from '@/queries/plannedWorkout';
import { advanceCycleCursor } from '@/queries/plans';
import { useQuickLog } from '@/queries/quickLog';
import {
  getActiveWorkout,
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
import { useFontScale } from '@/ui/useFontScale';

export default function TodayScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Clamped to the same 1.5x ceiling as the strip/label text variants — the
  // History-link arrow sits inline with `meta` text and must never outgrow it.
  const fontScale = useFontScale();
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

  // Recomputed on every focus: tabs keep this screen mounted for days, so a
  // mount-time memo would greet "Sunday evening" on Monday morning. The
  // resolved weekday follows the same rule so the plan card re-resolves after
  // a midnight rollover (spec 2026-08-10, day semantics: device-local).
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));
  const [todayDow, setTodayDow] = useState(() => new Date().getDay());
  useFocusEffect(
    useCallback(() => {
      setGreeting(greetingFor(new Date()));
      setTodayDow(new Date().getDay());
    }, []),
  );
  // Focus effects don't fire on app foregrounding — without this, an
  // overnight background would offer yesterday's scheduled workout (review
  // finding). Greeting rides along for the same reason.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setGreeting(greetingFor(new Date()));
        setTodayDow(new Date().getDay());
      }
    });
    return () => sub.remove();
  }, []);

  // What does the active plan schedule for today? (spec 2026-08-10)
  const scheduleQuery = useTodaySchedule(userId, todayDow);
  const schedule = scheduleQuery.data;
  const startPlanned = useStartPlannedWorkout(toastError);
  // Same double-fire latch + fresh invariant re-check as quick log.
  const planStartingRef = useRef(false);
  const onStartPlanned = useCallback(async () => {
    if (!userId || schedule?.kind !== 'workout' || planStartingRef.current) return;
    planStartingRef.current = true;
    try {
      const existing = await getActiveWorkout(userId);
      if (!existing) {
        await startPlanned.mutateAsync({
          userId,
          templateId: schedule.templateId,
          title: schedule.title,
        });
      }
      router.push('/workout/active');
    } catch {
      // useStartPlannedWorkout's onError already showed the toast.
    } finally {
      planStartingRef.current = false;
    }
  }, [userId, schedule, startPlanned]);

  // Skip wears the same double-fire latch as the start handlers, plus a
  // pending state — a second tap while the refetch is in flight must not skip
  // a real training day (review finding).
  const skipRef = useRef(false);
  const [skipping, setSkipping] = useState(false);
  const onSkipRest = useCallback(async () => {
    if (!userId || skipRef.current) return;
    skipRef.current = true;
    setSkipping(true);
    try {
      await advanceCycleCursor(userId);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    } finally {
      skipRef.current = false;
      setSkipping(false);
    }
  }, [userId, qc]);

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

  // Quick log (spec 2026-08-09-quick-log): picker first, then straight into a
  // workout titled after the exercise — two taps from Today to logging.
  const quickLog = useQuickLog(toastError);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  // Ref latch against the picker double-fire class (#16, completingRef
  // precedent): the sheet stays tappable through its 220ms exit animation, so
  // two picks can land before isPending flips (review finding).
  const quickLogStartingRef = useRef(false);
  const onQuickLogPick = useCallback(
    async (exerciseId: string) => {
      if (!userId || quickLogStartingRef.current) return;
      quickLogStartingRef.current = true;
      try {
        setQuickLogOpen(false);
        // Re-check the one-active-workout invariant with a FRESH read — the
        // button's disabled guard was evaluated before the picker opened, and
        // a sync pull can land an active workout mid-pick (review finding).
        // Per the approved design, resume it instead of minting a second one.
        const existing = await getActiveWorkout(userId);
        if (existing) {
          router.push('/workout/active');
          return;
        }
        await quickLog.mutateAsync({ userId, exerciseId });
        router.push('/workout/active');
      } catch {
        // useQuickLog's onError already showed the toast; stay on Today.
      } finally {
        quickLogStartingRef.current = false;
      }
    },
    [quickLog, userId],
  );

  if (!userId) return null;

  // Read once — reused by both the slotState derivation and the skeleton's
  // render below, instead of re-touching the snapshot ref at each site.
  const snapshotRepeatSeeds = initialSnapshot?.repeatSeeds;

  // Discriminant for the primary-card slot below — computed once so the
  // poster predicate (headline) can never disagree with what the slot
  // actually renders. Branch order matches the JSX exactly.
  const slotState: 'resume' | 'plan' | 'repeatSkeleton' | 'loading' | 'repeat' | 'empty' =
    activeQuery.data
      ? 'resume'
      : schedule?.kind === 'workout'
        ? 'plan'
        : lastFinishedQuery.isLoading && initialSnapshot?.state === 'repeat' && snapshotRepeatSeeds
          ? 'repeatSkeleton'
          : lastFinishedQuery.isLoading && !initialSnapshot
            ? 'loading'
            : lastFinishedQuery.data
              ? 'repeat'
              : 'empty';
  // Poster mode (the two-line display headline) is earned only when NO
  // act-now card occupies the primary slot — one attention owner per screen
  // (owner decision, impeccable r2 wave 2 S1). 'empty' has nothing to act
  // on; 'loading' renders a bare spinner (no card yet), and posting here
  // avoids a headline jump the instant it resolves into a real card.
  // 'repeatSkeleton' is itself a card (RepeatCard, just in its loading
  // dress) — it collapses like every other card state. The rest day no
  // longer earns a poster on its own: the rest strip below still marks it,
  // but the moment is no longer this screen's one display headline.
  const isPoster = slotState === 'empty' || slotState === 'loading';

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
            <Text
              variant="meta"
              color={theme.color.inkTertiary}
              numberOfLines={1}
              style={styles.historyLinkText}
            >
              History
            </Text>
            <Icon
              name="arrow-right"
              size={Math.round(14 * fontScale)}
              color={theme.color.inkTertiary}
            />
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
          {/* Latent interaction, benign with today's short copy: Text.tsx's
              injected lineHeight is sized off the declared displayXXL
              fontSize, but adjustsFontSizeToFit can silently shrink the
              rendered fontSize below that at runtime to fit numberOfLines={1}
              — if this copy ever grows long enough to trigger a real shrink,
              re-check that the (now oversized) line box still reads right. */}
          {isPoster ? (
            activeQuery.data ? (
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
            )
          ) : (
            // Collapsed: the act-now card below owns the moment — one quiet
            // line, no poster (spec impeccable batch 3).
            <Text
              variant="displayXL"
              color={theme.color.inkHero}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {activeQuery.data ? 'Back to work.' : 'Ready to lift.'}
            </Text>
          )}
        </SettleSlam>

        <QuarantineBanner
          staleCount={staleQuarantined.length}
          onPress={() => setQuarantineSheetOpen(true)}
        />

        <FadeInView>
          {slotState === 'resume' ? (
            <ResumeCard onPress={onResume} />
          ) : slotState === 'plan' && schedule?.kind === 'workout' ? (
            // The plan owns the primary slot on scheduled days (spec
            // 2026-08-10) — one act-now moment per screen; Repeat yields.
            <PlanCard
              title={schedule.title}
              planName={schedule.planName}
              exerciseNames={schedule.exerciseNames}
              loading={startPlanned.isPending}
              onPress={() => void onStartPlanned()}
            />
          ) : slotState === 'repeatSkeleton' && snapshotRepeatSeeds ? (
            <RepeatCard
              title={initialSnapshot?.repeatTitle ?? 'Workout'}
              daysAgo={initialSnapshot?.repeatDaysAgo ?? 0}
              seeds={snapshotRepeatSeeds}
              loading
              onPress={() => {
                /* no-op until live data lands */
              }}
            />
          ) : slotState === 'loading' ? (
            <View style={styles.cardSkeleton}>
              <ActivityIndicator color={theme.color.inkSecondary} />
            </View>
          ) : slotState === 'repeat' && lastFinishedQuery.data ? (
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

        {/* Rest day / cycle gap: a quiet strip, never a call to action. Cycle
            plans get a ghost Skip so the cursor can't stall on a rest slot OR
            an unconfigured/deleted-template slot (review finding). */}
        {!activeQuery.data && (schedule?.kind === 'rest' || schedule?.kind === 'gap') ? (
          <Plate tone="panel" style={styles.restStrip} faceStyle={styles.restFace}>
            <Text variant="meta" color={theme.color.inkSecondary} style={styles.flexText}>
              {schedule.kind === 'rest' ? 'Rest day' : 'Nothing scheduled'} · {schedule.planName}
            </Text>
            {schedule.planType === 'cycle' ? (
              <Button
                label={schedule.kind === 'rest' ? 'Skip rest' : 'Skip'}
                kind="ghost"
                size="row"
                disabled={skipping}
                onPress={() => void onSkipRest()}
                accessibilityLabel={
                  schedule.kind === 'rest' ? 'Skip this rest day' : 'Skip this cycle day'
                }
                accessibilityHint="Moves your cycle to the next workout"
              />
            ) : null}
          </Plate>
        ) : null}

        {/* One launcher group, not three scattered ghosts (impeccable polish
            fix A): the icon registry has no sensible glyph for "Blank
            workout" or "Training plan" (file/calendar), so Quick log drops
            its lone `plus` too — bare labels all round instead of an
            icon/no-icon split. */}
        <View style={styles.launcherGroup}>
          <View style={styles.launcherRow}>
            <Button
              label="Quick log"
              kind="ghost"
              size="row"
              onPress={() => setQuickLogOpen(true)}
              disabled={quickLog.isPending || !!activeQuery.data}
              accessibilityLabel="Quick log an exercise"
              accessibilityHint="Pick one exercise and start logging it immediately"
            />
            <Button
              label="Blank workout"
              kind="ghost"
              size="row"
              onPress={onBlankStart}
              disabled={createWorkout.isPending || !!activeQuery.data}
              accessibilityLabel="Start a blank workout"
              accessibilityHint="Begin a new workout with no exercises"
            />
          </View>
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
                {/* History row anatomy (impeccable polish fix B): hairline
                    top rule, skipped on the first row since the section
                    header's own rule above already separates it — same
                    rowFirst idiom as HistoryItem. No metadata strip: the
                    recent-workouts query (getRecentWorkouts, `SELECT *`) has
                    none of the set/exercise/volume aggregates History's
                    query computes, and adding them is a new query, out of
                    polish scope (HARD RULE). */}
                <View
                  style={[styles.recentRow, i === 0 && styles.recentRowFirst]}
                  accessibilityLabel={`${w.title || 'Workout'}, ${recentMeta(w).toLowerCase()}`}
                >
                  <Text
                    variant="card"
                    color={theme.color.ink}
                    numberOfLines={1}
                    style={styles.flexText}
                  >
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
      <ExercisePicker
        userId={userId}
        visible={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onPick={(exerciseId) => void onQuickLogPick(exerciseId)}
      />
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
  const fontScale = useFontScale();
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
        <Icon name="arrow-right" size={Math.round(16 * fontScale)} color={ink} />
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
    // Bottom padding clears the floating tab bar (critique P1: "Training
    // plan" / RECENT were hidden under it at default type size).
    scroll: {
      paddingTop: theme.space.s2,
      paddingBottom: theme.touch.navHeight + theme.space.section,
    },
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
      flexShrink: 1,
    },
    historyLinkPressed: { opacity: 0.6 },
    // The arrow icon keeps its fixed size; the "History" label truncates
    // first — same shrink priority as the card CTA rows.
    historyLinkText: { flexShrink: 1 },
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
    // marginTop closes the gap the reviewer flagged between the act-now card
    // above and this strip (impeccable r2 wave 2 S1).
    restStrip: { marginHorizontal: theme.space.s4, marginTop: theme.space.s3 },
    restFace: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.s3,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s2,
    },
    flexText: { flexShrink: 1 },
    // The three secondary launchers as ONE visible, left-anchored group
    // (impeccable polish fix A, follow-up). alignItems: 'flex-start' is load
    // bearing, not decorative: without it this column's default
    // alignItems:'stretch' stretches the lone Training Plan button's Plate
    // to the full container width, and Button's face is
    // alignItems/justifyContent:'center' — so a stretched face centers its
    // label. That's what put "Training plan" dead-center instead of on
    // Quick log's left edge. flex-start makes every child (the row, and
    // Training Plan) size to its own content and sit flush against the
    // group's left inset. gap is a small, even step (s3) shared by both
    // axes — the row's own internal gap and the vertical gap to Training
    // Plan read as one tight rhythm, not the section-scale gap before RECENT.
    launcherGroup: {
      alignItems: 'flex-start',
      paddingHorizontal: theme.space.s4,
      marginTop: theme.space.s2,
      gap: theme.space.s3,
    },
    launcherRow: {
      flexDirection: 'row',
      // Two ghost actions can still outrun narrow-device width; Yoga's
      // default flexShrink:0 would overflow rather than compress (review
      // finding precedent), so let the pair wrap.
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: theme.space.s3,
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
      // History row anatomy: hairline top rule per row (impeccable polish fix B).
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    // The header's rule below already separates the first row — matches
    // HistoryItem's rowFirst exactly.
    recentRowFirst: { borderTopWidth: 0 },
    recentEmpty: {
      paddingVertical: theme.space.s4,
    },
  });
