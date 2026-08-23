import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ActiveSetCard, type ActiveSetCardHandle } from '@/components/ActiveSetCard';
import {
  canCompleteSet,
  completedSetsBeforeCursor,
  countDiscardableSets,
  type ExerciseShape,
  findNextExercise,
  findPrevExercise,
  findSet,
  planStagedSet,
  type SetShape,
  setValuesLabel,
  workoutHeaderTitle,
} from '@/components/activeSet';
import { EditableTitle } from '@/components/EditableTitle';
import { EditSetSheet } from '@/components/EditSetSheet';
import { ExercisePicker } from '@/components/ExercisePicker';
import { SessionVolumeBar } from '@/components/SessionVolumeBar';
import { SyncErrorStripe } from '@/components/SyncErrorStripe';
import { VoiceHelpSheet } from '@/components/VoiceHelpSheet';
import { VoiceMicButton } from '@/components/VoiceMicButton';
import { useVoiceSession } from '@/voice/useVoiceSession';
import { useAddExerciseToWorkout } from '@/queries/exercises';
import { useProfile } from '@/queries/profile';
import { queryKeys } from '@/queries/keys';
import { addSet, useUpdateSet } from '@/queries/sets';
import {
  deleteWorkoutLocal,
  useActiveWorkout,
  useFinishWorkout,
  useSetExerciseNote,
  useSetWorkoutNote,
  useUpdateWorkoutTitle,
} from '@/queries/workouts';
import { NoteSheet } from '@/components/NoteSheet';
import { useWorkoutDetail } from '@/queries/workoutDetail';
import { DEFAULT_UNITS, sumVolume } from '@/core/units';
import { RestOverrideSheet } from '@/rest/RestOverrideSheet';
import { RestProgressBar } from '@/rest/RestProgressBar';
import { useRestTimer } from '@/rest/useRestTimer';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { SessionRecap } from '@/ui/SessionRecap';
import { SettleSlam } from '@/ui/SettleSlam';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useSyncAwareErrorToast } from '@/ui/ToastContext';
import { useTheme } from '@/ui/useTheme';

import { useWorkoutCursor } from './workoutActive/useWorkoutCursor';
import { useSessionPRs } from './workoutActive/useSessionPRs';
import { useRestOverrides } from './workoutActive/useRestOverrides';

export default function WorkoutActiveScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const syncAwareError = useSyncAwareErrorToast();
  const toastError = useCallback((msg: string) => syncAwareError(msg), [syncAwareError]);

  const theme = useTheme();
  const qc = useQueryClient();
  // Direct addSet() calls below bypass the mutation hooks, so they must refresh
  // the composite detail query themselves — otherwise, offline, the staged set
  // never appears and the screen hangs on a spinner (deep-review #11).
  const refreshDetail = useCallback(
    () => void qc.invalidateQueries({ queryKey: queryKeys.workouts.detailRoot }),
    [qc],
  );
  const activeQuery = useActiveWorkout(userId);
  const detail = useWorkoutDetail(activeQuery.data?.id);
  const profileQuery = useProfile(userId);
  const units: 'kg' | 'lb' = profileQuery.data?.units ?? DEFAULT_UNITS;
  const weightUnit = units === 'kg' ? 'KG' : 'LB';
  const weightStep = units === 'kg' ? 2.5 : 5;

  const addExercise = useAddExerciseToWorkout(toastError);
  const updateSet = useUpdateSet(toastError);
  // TanStack's useMutation returns a fresh object every render; `.mutate`
  // itself is stable across renders, so depending on THIS instead of
  // `updateSet` keeps onChangeWeight/onChangeReps/onComplete referentially
  // stable — otherwise they churn every render and defeat ActiveSetCard's
  // memo (Batch 2 P1) on every keystroke (final review F2).
  const updateSetMutate = updateSet.mutate;
  const finishWorkout = useFinishWorkout(userId, toastError);
  const updateTitle = useUpdateWorkoutTitle(toastError);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  // Recap branch only (spec 2026-08-22 §3): destructive confirm when Finish
  // would prune incomplete sets. Declared here, not inside the `!cursor`
  // branch, per the file's unconditional-hooks convention.
  const [finishConfirm, setFinishConfirm] = useState(false);

  // Session-capture notes (spec 2026-08-09): one sheet, session + current
  // exercise. The exercise target is SNAPSHOTTED when the sheet opens, so a
  // cursor move (e.g. a voice "next exercise" behind the modal) can't retarget
  // typed text onto another exercise (review finding). Saves go through the
  // outbox like every other mutation.
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<{
    weId: string;
    name: string;
    note: string | null;
  } | null>(null);
  const setWorkoutNoteMut = useSetWorkoutNote(toastError);
  const setExerciseNoteMut = useSetExerciseNote(toastError);
  const onSaveNotes = useCallback(
    (changes: { sessionNote?: string | null; exerciseNote?: string | null }, weId?: string) => {
      if (changes.sessionNote !== undefined && activeQuery.data) {
        setWorkoutNoteMut.mutate({ workoutId: activeQuery.data.id, note: changes.sessionNote });
      }
      if (changes.exerciseNote !== undefined && weId) {
        setExerciseNoteMut.mutate({ weId, note: changes.exerciseNote });
      }
      setNoteSheetOpen(false);
    },
    [activeQuery.data, setWorkoutNoteMut, setExerciseNoteMut],
  );

  // Live PR detection (#25) — see useSessionPRs.
  const { bankSignal, sessionPRs, registerBank } = useSessionPRs(userId);

  // Banked-set editing (backlog 1.1): the target survives close so the sheet
  // keeps its content through the exit animation.
  const [editTarget, setEditTarget] = useState<{ set: SetShape; number: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const onEditSet = useCallback((s: SetShape, displayIndex: number) => {
    setEditTarget({ set: s, number: displayIndex });
    setEditOpen(true);
  }, []);

  // Map query data into the ExerciseShape used by the state machine
  const exercises: ExerciseShape[] = useMemo(() => {
    if (!detail.data) return [];
    return detail.data.exercises.map((we) => ({
      id: we.id,
      exerciseId: we.exercise_id,
      exerciseName: we.exercise?.name ?? 'Unknown exercise',
      orderIndex: we.order_index,
      muscleGroup: we.exercise?.muscle_group ?? null,
      sets: (we.sets ?? []).map((s) => ({
        id: s.id,
        weId: we.id,
        orderIndex: s.order_index,
        weight: s.weight,
        reps: s.reps,
        units: s.units,
        completed: Boolean(s.completed),
      })),
    }));
  }, [detail.data]);

  // First-run de-nesting (impeccable batch 5): a workout that starts genuinely
  // blank (no template/plan/voice seed — those always land here with at least
  // one exercise already) would otherwise strand the user one tap away from
  // "Add exercise" in the empty state. Auto-open the picker once the workout
  // has actually loaded with zero exercises. Latched via render-time state
  // adjustment, not a useEffect: this file's own neighborhood precedent
  // (useRestClock's stale-frame fix, commit 62fb8b1) is that syncing state
  // off arriving data from inside an effect paints one stale frame first and
  // trips `react-hooks/set-state-in-effect`; adjusting during render (React's
  // documented "storing information from previous renders" recipe) opens the
  // picker the instant the zero-exercise data is seen, and the flag flipping
  // permanently on the very next line means it can never re-fire — no re-open
  // loop from a picker closed without picking.
  const [autoOpenedPicker, setAutoOpenedPicker] = useState(false);
  if (!autoOpenedPicker && activeQuery.data && detail.data && exercises.length === 0) {
    setAutoOpenedPicker(true);
    setPickerOpen(true);
  }

  // Cursor state machine (init/reposition #21/#77, leave-confirm #12, add-
  // exercise targeting #13) — see useWorkoutCursor.
  const {
    cursor,
    setCursor,
    currentExercise: currentExForRest,
    stagedMarkers,
    markStaged,
    markCarried,
    targetExercise,
    onNextExercise,
    onPrevExercise,
    leaveConfirm,
    setLeaveConfirm,
  } = useWorkoutCursor({ exercises, refreshDetail, userId, units, weightStep });

  const { overrides, reloadOverrides, restSeconds, overrideSheetOpen, setOverrideSheetOpen } =
    useRestOverrides(currentExForRest);
  const timer = useRestTimer({ targetSeconds: restSeconds });

  const onChangeWeight = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      // Stamp the unit the weight is being logged in (per-set provenance,
      // #131); clearing the weight clears the stamp with it. (EditSetSheet
      // deliberately differs: editing a LOGGED set keeps its historical stamp
      // on clear — don't "unify" these.)
      updateSetMutate({
        setId: cursor.setId,
        weId: cursor.weId,
        patch: { weight: next, units: next != null ? units : null },
      });
    },
    [cursor, updateSetMutate, units],
  );

  const onChangeReps = useCallback(
    (next: number | null) => {
      if (!cursor) return;
      updateSetMutate({ setId: cursor.setId, weId: cursor.weId, patch: { reps: next } });
    },
    [cursor, updateSetMutate],
  );

  // Guards against a swipe + voice "done" double-fire racing two completions /
  // two staged sets onto the same cursor (#16).
  const completingRef = useRef(false);
  const onComplete = useCallback(
    async (values?: { weight: number | null; reps: number | null }) => {
      if (!cursor || completingRef.current) return;
      completingRef.current = true;
      try {
        // Mark the current set complete
        updateSetMutate({ setId: cursor.setId, weId: cursor.weId, patch: { completed: true } });
        timer.start();
        // Auto-stage the next set with the same weight × reps (Phase 3).
        // Overlay the just-flushed keypad values — the cached set may lag an
        // edit committed milliseconds ago (flush-before-consume, spec §3).
        const rawSetData = currentExForRest && findSet(currentExForRest, cursor.setId);
        const currentSetData = rawSetData ? { ...rawSetData, ...(values ?? {}) } : null;
        const staged = planStagedSet(currentSetData ?? null, units);

        // Did the set just banked beat the all-time heaviest for this exercise?
        registerBank(currentExForRest, currentSetData ?? null, units);

        const newSetId = await addSet(cursor.weId, staged);
        // Record what we pre-filled so an untouched staged set advances silently.
        markCarried({ id: newSetId, weight: staged.weight, reps: staged.reps });
        refreshDetail();
        setCursor({ weId: cursor.weId, setId: newSetId });
      } finally {
        completingRef.current = false;
      }
    },
    [
      cursor,
      currentExForRest,
      updateSetMutate,
      timer,
      refreshDetail,
      units,
      registerBank,
      markCarried,
      setCursor,
    ],
  );

  // Flush-before-consume (spec §3): every path that acts on the current set
  // commits any open keypad edit first, then reads the effective values.
  const cardRef = useRef<ActiveSetCardHandle>(null);
  const onLogSet = useCallback(() => {
    const values = cardRef.current?.flushEdits() ?? null;
    if (!values || !canCompleteSet({ reps: values.reps })) return;
    // Medium = "set banked" — same signature haptic as the swipe path (spec §3).
    haptics.medium();
    void onComplete(values);
  }, [onComplete]);

  const onNextExercisePress = useCallback(() => {
    onNextExercise(cardRef.current?.flushEdits() ?? null);
  }, [onNextExercise]);
  const onPrevExercisePress = useCallback(() => {
    onPrevExercise(cardRef.current?.flushEdits() ?? null);
  }, [onPrevExercise]);

  const onDiscardEmpty = useCallback(async () => {
    if (!activeQuery.data) return;
    await deleteWorkoutLocal(activeQuery.data.id);
    void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    router.replace('/today');
  }, [activeQuery.data, qc]);

  const onFinish = useCallback(async () => {
    if (!activeQuery.data) return;
    await finishWorkout.mutateAsync(activeQuery.data.id);
    timer.stop();
    router.replace('/today');
  }, [activeQuery.data, finishWorkout, timer]);

  const onAddExercise = useCallback(
    async (exerciseId: string) => {
      if (!activeQuery.data) return;
      setPickerOpen(false);
      const { weId, staged } = await addExercise.mutateAsync({
        workoutId: activeQuery.data.id,
        exerciseId,
        prefill: userId ? { userId, units, weightStep } : undefined,
      });
      // Register the history-prefilled staged set so it advances silently when
      // untouched (#12) and shows the LAST TIME provenance strip (spec §2).
      if (staged) markStaged(staged);
      // Land the cursor on the new exercise (its auto-staged set), not the first
      // incomplete set in the workout (#13). The init effect picks this up once
      // the new exercise appears in the cached data.
      targetExercise(weId);
    },
    [activeQuery.data, addExercise, targetExercise, userId, units, weightStep, markStaged],
  );

  // Hands-free voice session. Data commands route through the tested dispatch
  // layer; "done" reuses the screen's canonical completion (timer + auto-stage);
  // "finish workout" drops to the existing finish-summary confirm screen.
  const voice = useVoiceSession({
    getDispatchContext: () => ({
      userId: userId ?? '',
      workoutId: activeQuery.data?.id ?? '',
      activeWeId: cursor?.weId ?? null,
      activeSetId: cursor?.setId ?? null,
      units,
    }),
    getParserContext: () => ({ units, hasActiveExercise: exercises.length > 0 }),
    onStartRest: (seconds) => timer.start(seconds), // honor a spoken duration (#105)
    onStopRest: () => timer.stop(),
    onNextExercise: onNextExercisePress,
    onPrevExercise: onPrevExercisePress,
    onFinishWorkout: () => setCursor(null),
    onCompleteSet: () => onLogSet(),
  });

  const hasNextExercise = currentExForRest
    ? findNextExercise(exercises, currentExForRest.id) !== null
    : false;
  // Mirrors hasNextExercise (findPrevExercise/findNextExercise are already the
  // tested pure pair in activeSet.ts) — feeds the prev control's disabled state.
  const hasPrevExercise = currentExForRest
    ? findPrevExercise(exercises, currentExForRest.id) !== null
    : false;

  const screenOptions = useMemo(
    () => ({
      headerTitle: () => (
        <EditableTitle
          // Fallback is the day the workout STARTED, never "today" (1.7/#156).
          value={workoutHeaderTitle(activeQuery.data?.title, activeQuery.data?.started_at)}
          onCommit={(next) => {
            if (activeQuery.data) {
              updateTitle.mutate({ workoutId: activeQuery.data.id, title: next });
            }
          }}
        />
      ),
      // The next/finish control lives in the bottom action row now, in the thumb
      // zone — not stranded in the top-right header (#1.5).
      headerRight: () => <SyncIndicator />,
    }),
    [activeQuery.data, updateTitle],
  );

  // Stabilize the props ActiveSetCard/SessionVolumeBar read so their new
  // React.memo wraps can actually skip a re-render (Batch 2 P1). These hooks
  // must sit here, above every early return below, per this file's
  // unconditional-hooks convention — currentExForRest/cursor can still be
  // null this early, so each guards internally.
  const ghostSets = useMemo(
    () => (currentExForRest && cursor ? completedSetsBeforeCursor(currentExForRest, cursor) : []),
    [currentExForRest, cursor],
  );

  // LAST TIME provenance strip (spec §2): only while the cursor sits on the
  // history-prefilled staged set AND the values are still untouched.
  const lastTime = useMemo(() => {
    if (!currentExForRest || !cursor) return null;
    const set = findSet(currentExForRest, cursor.setId);
    if (!set) return null;
    const seedMarker = stagedMarkers.get(set.id) ?? null;
    return seedMarker &&
      seedMarker.source === 'history' &&
      set.weight === seedMarker.weight &&
      set.reps === seedMarker.reps
      ? { weight: seedMarker.weight, reps: seedMarker.reps }
      : null;
  }, [currentExForRest, cursor, stagedMarkers]);

  // The voice card prop changes on every speech partial — narrow the three
  // fields ActiveSetCard reads first (VoiceUiState is a discriminated union;
  // `partial`/`label` only exist on some phases) and memoize on those, so the
  // prop is stable BETWEEN voice events, not frozen (Batch 2 P1).
  const voicePartial = voice.ui.phase === 'listening' ? voice.ui.partial : undefined;
  const voiceFeedback =
    voice.ui.phase === 'pending' || voice.ui.phase === 'applied' || voice.ui.phase === 'error'
      ? voice.ui.label
      : undefined;
  const voiceCardState = useMemo(
    () => ({ phase: voice.ui.phase, partial: voicePartial, feedback: voiceFeedback }),
    [voice.ui.phase, voicePartial, voiceFeedback],
  );

  const handleSetComplete = useCallback(
    (values: { weight: number | null; reps: number | null }) => void onComplete(values),
    [onComplete],
  );

  if (!userId) return null;

  if (activeQuery.isLoading || detail.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
      </SafeAreaView>
    );
  }

  if (!activeQuery.data || !detail.data) {
    // Composed empty state (Blacktop spec): mark + one display line + one CTA —
    // never copy floating in a void.
    return (
      <SafeAreaView
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.color.bg, paddingHorizontal: theme.space.page },
        ]}
      >
        <EmptyState
          title="No active workout."
          cta={{
            label: 'Back to Today',
            kind: 'secondary',
            onPress: () => router.replace('/today'),
          }}
        />
      </SafeAreaView>
    );
  }

  // No exercises yet
  if (exercises.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View
          style={[
            styles.center,
            { flex: 1, gap: theme.space.s4, paddingHorizontal: theme.space.page },
          ]}
        >
          <EmptyState
            title="No exercises yet."
            hint="Add your first exercise to begin."
            cta={{
              label: 'Add exercise',
              kind: 'secondary',
              icon: 'plus',
              onPress: () => setPickerOpen(true),
              accessibilityLabel: 'Add your first exercise',
            }}
          />
          {/* Escape hatch (ghost secondary): an exercise-less workout could
              otherwise be neither finished nor discarded, stranding the user (#18). */}
          <Button
            label="Discard workout"
            kind="ghost"
            size="row"
            onPress={() => setDiscardConfirm(true)}
            accessibilityLabel="Discard workout"
          />
        </View>
        <ConfirmSheet
          visible={discardConfirm}
          onClose={() => setDiscardConfirm(false)}
          title="Discard workout?"
          message="This empty workout will be removed."
          confirmLabel="Discard"
          destructive
          onConfirm={() => void onDiscardEmpty()}
        />
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
      </SafeAreaView>
    );
  }

  // Cursor is null → all exercises complete → show Finish summary
  if (!cursor) {
    const incomplete = countDiscardableSets(exercises, stagedMarkers);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
        <Stack.Screen options={screenOptions} />
        <View
          style={[
            styles.center,
            { flex: 1, gap: theme.space.s6, paddingHorizontal: theme.space.page },
          ]}
        >
          <SettleSlam>
            <Text variant="display" color={theme.color.inkHero} style={styles.centerText}>
              Workout complete
            </Text>
          </SettleSlam>
          <SessionRecap
            volume={totalVolume(exercises, units)}
            setCount={totalSetsCompleted(exercises)}
            durationMs={
              activeQuery.data.started_at
                ? Date.now() - new Date(activeQuery.data.started_at).getTime()
                : 0
            }
            units={units}
            prs={sessionPRs}
          />
          <View style={styles.finishActions}>
            <Button
              label="Finish workout"
              size="cta"
              loading={finishWorkout.isPending}
              onPress={() => (incomplete > 0 ? setFinishConfirm(true) : onFinish())}
              accessibilityLabel="Finish workout"
              style={styles.fullBtn}
            />
            <Button
              label="Add exercise"
              kind="secondary"
              size="row"
              icon="plus"
              onPress={() => setPickerOpen(true)}
              accessibilityLabel="Add exercise to workout"
              style={styles.fullBtn}
            />
            <Button
              label={activeQuery.data.note ? 'Edit session note' : 'Session note'}
              kind="ghost"
              size="row"
              onPress={() => {
                setNoteTarget(null); // recap annotates the session only
                setNoteSheetOpen(true);
              }}
              accessibilityLabel="Session note"
              style={styles.fullBtn}
            />
          </View>
        </View>
        <ExercisePicker
          userId={userId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={onAddExercise}
        />
        <NoteSheet
          visible={noteSheetOpen}
          sessionNote={activeQuery.data.note}
          exercise={noteTarget}
          saving={setWorkoutNoteMut.isPending || setExerciseNoteMut.isPending}
          onSave={(changes) => onSaveNotes(changes, noteTarget?.weId)}
        />
        <ConfirmSheet
          visible={finishConfirm}
          onClose={() => setFinishConfirm(false)}
          title="Finish workout?"
          message={`${incomplete} incomplete ${incomplete === 1 ? 'set' : 'sets'} will be discarded.`}
          confirmLabel="Finish"
          destructive
          onConfirm={onFinish}
        />
      </SafeAreaView>
    );
  }

  const currentEx = currentExForRest;
  const currentSet = currentEx ? findSet(currentEx, cursor.setId) : null;
  if (!currentEx || !currentSet) {
    // The cursor briefly points at a set that isn't in the latest data — e.g.
    // just after auto-staging the next set, before the React Query refetch
    // lands. The cursor-reset effect repositions it on the next tick; render a
    // placeholder until then instead of dereferencing null.
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: theme.color.bg }]}>
        <ActivityIndicator color={theme.color.inkSecondary} />
        {/* Keep the note sheet mounted through this one-tick placeholder so a
            cursor transition can't unmount it and drop typed text. */}
        <NoteSheet
          visible={noteSheetOpen}
          sessionNote={activeQuery.data.note}
          exercise={noteTarget}
          saving={setWorkoutNoteMut.isPending || setExerciseNoteMut.isPending}
          onSave={(changes) => onSaveNotes(changes, noteTarget?.weId)}
        />
      </SafeAreaView>
    );
  }
  const currentExIdx = exercises.findIndex((e) => e.id === currentEx.id);
  const currentSetIdx = currentEx.sets.findIndex((s) => s.id === currentSet.id);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <SyncErrorStripe />
      <Stack.Screen options={screenOptions} />
      <RestProgressBar
        running={timer.running}
        startedAt={timer.startedAt}
        targetSeconds={timer.targetSeconds}
        onSkip={timer.stop}
        onOpenOverride={() => setOverrideSheetOpen(true)}
      />
      <SessionVolumeBar
        volume={totalVolume(exercises, units)}
        units={units}
        bankSignal={bankSignal}
      />
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <ActiveSetCard
          key={currentSet.id}
          ref={cardRef}
          exercise={currentEx}
          set={currentSet}
          exerciseIndex={currentExIdx + 1}
          totalExercises={exercises.length}
          setIndex={currentSetIdx + 1}
          weightStep={weightStep}
          weightUnit={weightUnit}
          ghostSets={ghostSets}
          onChangeWeight={onChangeWeight}
          onChangeReps={onChangeReps}
          onComplete={handleSetComplete}
          onEditSet={onEditSet}
          lastTime={lastTime}
          voice={voiceCardState}
        />
        <View style={styles.voiceArea}>
          <VoiceMicButton
            phase={!voice.available ? 'disabled' : voice.ui.phase === 'idle' ? 'idle' : 'listening'}
            onTap={() => (voice.ui.phase === 'idle' ? void voice.start() : voice.stop())}
            onHoldStart={() => void voice.start()}
            onHoldEnd={() => voice.stop()}
          />
          {voice.ui.phase === 'pending' ? (
            <Button
              label="Confirm"
              kind="ghost"
              size="row"
              onPress={() => void voice.confirmPending()}
              accessibilityLabel="Confirm voice command"
            />
          ) : null}
          {voice.available ? (
            // hitSlop pads the meta-line label (~19pt) up to the 44pt touch
            // minimum without reflowing the voice row's layout.
            <Pressable
              onPress={() => setVoiceHelpOpen(true)}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Voice command help"
            >
              <Text variant="meta" color={theme.color.inkSecondary}>
                What can I say
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Button
          label="Add exercise"
          kind="ghost"
          size="row"
          icon="plus"
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Add exercise to workout"
        />
        <Button
          label="Notes"
          kind="ghost"
          size="row"
          onPress={() => {
            setNoteTarget({
              weId: currentEx.id,
              name: currentEx.exerciseName,
              note: detail.data?.exercises.find((we) => we.id === currentEx.id)?.note ?? null,
            });
            setNoteSheetOpen(true);
          }}
          accessibilityLabel="Session and exercise notes"
          accessibilityHint="Add a note for this session or the current exercise"
        />
      </ScrollView>
      {/* LOG SET is the thumb-zone primary (spec §3): inverted plate, value echo.
          Volt stays reserved for the recap's finish CTA; Next/Finish is quiet. */}
      <View style={styles.bottomBar}>
        {/* Icon-only, built on Plate directly rather than Button: an empty
            Button label leaves a zero-width Text node in the label row's gap,
            which visibly off-centers the icon. Plate gives the same ghost
            fill/border, disabled dimming, and press dip Button uses, with no
            new colors (batch 2 review). */}
        <Plate
          tone="ghost"
          onPress={onPrevExercisePress}
          disabled={!hasPrevExercise}
          accessibilityRole="button"
          accessibilityLabel="Previous exercise"
          accessibilityHint="Move to the previous exercise"
          style={styles.prevBtn}
          faceStyle={styles.prevFace}
        >
          <Icon name="chevron-left" size={18} color={theme.color.ink} />
        </Plate>
        <Button
          label={hasNextExercise ? 'Next ›' : 'Finish ›'}
          kind="ghost"
          size="cta"
          onPress={onNextExercisePress}
          accessibilityLabel={hasNextExercise ? 'Next exercise' : 'Go to workout summary'}
          accessibilityHint={
            hasNextExercise ? 'Move to the next exercise' : 'Shows the finish summary'
          }
        />
        <Button
          label={
            canCompleteSet(currentSet)
              ? `Log set · ${setValuesLabel(currentSet.weight, currentSet.reps)}`
              : 'Enter reps'
          }
          kind="inverted"
          size="cta"
          disabled={!canCompleteSet(currentSet)}
          onPress={onLogSet}
          accessibilityLabel={`Log set ${currentSetIdx + 1}`}
          accessibilityHint="Completes this set and stages the next one"
          style={styles.logBtn}
        />
      </View>
      <ExercisePicker
        userId={userId}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onAddExercise}
      />
      <NoteSheet
        visible={noteSheetOpen}
        sessionNote={activeQuery.data.note}
        exercise={noteTarget}
        saving={setWorkoutNoteMut.isPending || setExerciseNoteMut.isPending}
        onSave={(changes) => onSaveNotes(changes, noteTarget?.weId)}
      />
      <VoiceHelpSheet visible={voiceHelpOpen} onClose={() => setVoiceHelpOpen(false)} />
      {currentEx ? (
        <RestOverrideSheet
          visible={overrideSheetOpen}
          exerciseId={currentEx.exerciseId}
          exerciseName={currentEx.exerciseName}
          muscleGroup={currentEx.muscleGroup ?? null}
          currentOverride={overrides[currentEx.exerciseId] ?? null}
          onClose={() => setOverrideSheetOpen(false)}
          onChanged={() => void reloadOverrides()}
        />
      ) : null}
      {editTarget ? (
        <EditSetSheet
          visible={editOpen}
          set={editTarget.set}
          setNumber={editTarget.number}
          exerciseName={currentEx.exerciseName}
          exerciseId={currentEx.exerciseId}
          userId={userId}
          units={units}
          weightStep={weightStep}
          weightUnit={weightUnit}
          onClose={() => setEditOpen(false)}
          onError={toastError}
        />
      ) : null}
      <ConfirmSheet
        visible={!!leaveConfirm}
        onClose={() => setLeaveConfirm(null)}
        title="Leave this set?"
        message="You’ve entered weight or reps but haven’t logged this set. Log it with the Log set button, or leave it."
        confirmLabel="Leave"
        destructive
        onConfirm={() => leaveConfirm?.()}
      />
    </SafeAreaView>
  );
}

function totalSetsCompleted(exs: ExerciseShape[]): number {
  return exs.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0);
}

function totalVolume(exs: ExerciseShape[], displayUnits: 'kg' | 'lb'): number {
  // Convert every completed set into the display unit before summing so a
  // mixed-unit history aggregates honestly (#131/#135).
  return sumVolume(
    exs.flatMap((ex) => ex.sets.filter((s) => s.completed)),
    displayUnits,
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { textAlign: 'center' },
  scrollFlex: { flex: 1 },
  scroll: { paddingBottom: 24 },
  voiceArea: { marginTop: 16, gap: 12 },
  finishActions: { alignSelf: 'stretch', gap: 12 },
  fullBtn: { alignSelf: 'stretch' },
  bottomBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  logBtn: { flex: 1 },
  // Fixed width, no flex — Log set keeps its thumb-zone dominance and Next/
  // Finish keeps its current flex (batch 2 spec).
  prevBtn: { width: 44 },
  prevFace: { alignItems: 'center', justifyContent: 'center' },
});
