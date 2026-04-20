import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/useAuth';
import { useActiveWorkout, useWorkoutWithExercises, useLastPerformedSets } from '../lib/queries/workouts';
import { useProfile } from '../lib/queries/profile';
import { useAddSet, useUpdateSet, useDeleteSet, useDeleteWorkout, useFinishWorkout, useReorderExercise } from '../lib/queries/sets';
import { useActivePlan, useAdvanceCycle, getTodaySlot } from '../lib/queries/plans';
import { detectAndInsertPRs } from '../lib/pr-detection';
import { computeVolume, computeSetCounts, formatVolume, computeElapsedDisplay, buildFinishSummary } from '../lib/workoutLogic';
import { combineMutationFlags } from '../lib/syncHelpers';
import { track } from '../lib/analytics';
import type { WorkoutSummary } from '../lib/domain';
import { ExerciseBlock } from '../components/ExerciseBlock';
import { PlusIcon, CheckIcon, XIcon } from '../components/Icons';
import { ExerciseSearchModal } from '../components/ExerciseSearchModal';
import { Sheet } from '../components/Sheet';
import { useToast } from '../lib/useToast';
import { SyncStatus } from '../components/SyncStatus';
import { TrophyIllustration } from '../components/EmptyState';
import './WorkoutActive.css';

function useElapsedTime(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState('0m');
  useEffect(() => {
    if (!startedAt) return;
    const update = () => setElapsed(computeElapsedDisplay(startedAt));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function WorkoutActive() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const units = profile?.units ?? 'kg';
  const { data: activeWorkout, isLoading: activeLoading } = useActiveWorkout(user?.id);
  const { data: detail, isError: detailError } = useWorkoutWithExercises(activeWorkout?.id);
  const addSet = useAddSet(activeWorkout?.id);
  const updateSet = useUpdateSet(activeWorkout?.id);
  const deleteSet = useDeleteSet(activeWorkout?.id);
  const finishWorkout = useFinishWorkout(user?.id);
  const reorderExercise = useReorderExercise(activeWorkout?.id);
  const deleteWorkout = useDeleteWorkout(user?.id);
  const { data: activePlan } = useActivePlan(user?.id);
  const advanceCycle = useAdvanceCycle(user?.id);

  const exerciseIds = useMemo(
    () => detail?.workoutExercises.map((we) => we.exercise_id) ?? [],
    [detail]
  );
  const { data: lastPerformed } = useLastPerformedSets(user?.id, exerciseIds);

  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [hiddenSetIds, setHiddenSetIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { toast } = useToast();

  const elapsed = useElapsedTime(detail?.workout.started_at);
  const shouldRedirect = activeWorkout == null && !activeLoading;

  useEffect(() => {
    if (shouldRedirect) navigate('/');
  }, [shouldRedirect, navigate]);

  if (shouldRedirect) return null;

  if (detailError) {
    return (
      <div className="workout-active">
        <div className="workout-active-error">
          <p className="section-title">Failed to load workout</p>
          <p className="meta">Check your connection and try again.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  const handleAddSet = (workoutExerciseId: string, orderIndex: number) => {
    addSet.mutate(
      { workout_exercise_id: workoutExerciseId, order_index: orderIndex },
      { onError: () => toast('Failed to add set', 'error') }
    );
  };

  const handleUpdateSet = (
    setId: string,
    updates: {
      weight?: number | null;
      reps?: number | null;
      completed?: boolean;
      completed_at?: string | null;
    }
  ) => {
    updateSet.mutate({ setId, updates }, { onError: () => toast('Failed to update set', 'error') });
  };

  const flushPendingDeletes = useCallback(() => {
    pendingDeleteTimers.current.forEach((timer, setId) => {
      clearTimeout(timer);
      deleteSet.mutate(setId);
    });
    pendingDeleteTimers.current.clear();
    setHiddenSetIds(new Set());
  }, [deleteSet]);

  const handleDeleteSet = (setId: string) => {
    setHiddenSetIds((prev) => new Set(prev).add(setId));

    const timer = setTimeout(() => {
      pendingDeleteTimers.current.delete(setId);
      setHiddenSetIds((prev) => {
        const next = new Set(prev);
        next.delete(setId);
        return next;
      });
      deleteSet.mutate(setId, { onError: () => toast('Failed to delete set', 'error') });
    }, 4000);

    pendingDeleteTimers.current.set(setId, timer);

    toast('Set deleted', 'info', {
      label: 'Undo',
      onClick: () => {
        const pending = pendingDeleteTimers.current.get(setId);
        if (pending) {
          clearTimeout(pending);
          pendingDeleteTimers.current.delete(setId);
        }
        setHiddenSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      },
    });
  };

  const handleMoveExercise = (weId: string, currentIndex: number, direction: -1 | 1) => {
    const exercises = detail?.workoutExercises;
    if (!exercises) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= exercises.length) return;
    const targetWe = exercises[targetIndex];
    reorderExercise.mutate(
      { sourceId: weId, targetId: targetWe.id, sourceIndex: currentIndex, targetIndex },
      { onError: () => toast('Failed to reorder exercise', 'error') },
    );
  };

  const handleFinish = async () => {
    if (!activeWorkout?.id || !user?.id || !detail) return;
    setConfirmFinish(false);
    flushPendingDeletes();
    let prCount = 0;
    try {
      prCount = await detectAndInsertPRs(
        user.id,
        activeWorkout.id,
        detail.workoutExercises.map((we) => ({
          exercise_id: we.exercise_id,
          sets: we.sets.map((s) => ({
            weight: s.weight,
            reps: s.reps,
            completed: s.completed,
          })),
        }))
      );
    } catch {
      /* non-blocking */
    }
    try {
      await finishWorkout.mutateAsync(activeWorkout.id);
      queryClient.invalidateQueries({ queryKey: ['records'] });

      if (activePlan?.plan_type === 'cycle' && activePlan.slots.length > 0) {
        const todaySlot = getTodaySlot(activePlan);
        if (todaySlot && !todaySlot.is_rest_day && todaySlot.template_id === activeWorkout.template_id) {
          advanceCycle.mutate({ planId: activePlan.id, totalSlots: activePlan.slots.length });
        }
      }

      const exerciseCount = detail.workoutExercises.length;
      const setCount = detail.workoutExercises.reduce((sum, we) => sum + we.sets.length, 0);
      const startTime = new Date(detail.workout.started_at).getTime();
      const durationS = Math.round((Date.now() - startTime) / 1000);
      track({ name: 'workout_completed', properties: { duration_s: durationS, exercise_count: exerciseCount, set_count: setCount } });
      setSummary(buildFinishSummary(detail.workoutExercises, prCount, elapsed));
    } catch {
      toast('Failed to save workout', 'error');
    }
  };

  const handleDismissSummary = () => {
    setSummary(null);
    setCompleting(true);
    setTimeout(() => navigate('/'), 500);
  };

  const handleDiscard = async () => {
    if (!activeWorkout?.id) return;
    setConfirmDiscard(false);
    try {
      await deleteWorkout.mutateAsync(activeWorkout.id);
      track({ name: 'workout_discarded' });
      navigate('/');
    } catch {
      toast('Failed to discard workout', 'error');
    }
  };

  const { completed: completedSets, total: totalSets } = useMemo(
    () => detail ? computeSetCounts(detail.workoutExercises, hiddenSetIds) : { completed: 0, total: 0 },
    [detail, hiddenSetIds],
  );

  const liveVolume = useMemo(
    () => detail ? computeVolume(detail.workoutExercises, hiddenSetIds) : 0,
    [detail, hiddenSetIds],
  );

  const progressPct = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const { isPending: anySaving, isError: anyError } = combineMutationFlags(
    addSet, updateSet, deleteSet, reorderExercise,
  );

  return (
    <div className={'workout-active' + (completing ? ' workout-active--completing' : '')}>
      <header className="workout-active-header">
        <div className="workout-active-header-row">
          <h1 className="workout-active-title">
            {detail?.workout.title ?? 'Workout'}
          </h1>
          <button
            type="button"
            className="workout-active-close"
            onClick={() => setConfirmDiscard(true)}
            aria-label="Discard workout"
          >
            <XIcon size={20} />
          </button>
        </div>
        {totalSets > 0 && (
          <div className="workout-active-progress">
            <div
              className="workout-active-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        <div className="workout-active-stat-row">
          <div className="workout-active-stat">
            <span className="workout-active-stat-value tabular">{elapsed}</span>
            <span className="workout-active-stat-label">Duration</span>
          </div>
          <div className="workout-active-stat-divider" />
          <div className="workout-active-stat">
            <span className="workout-active-stat-value tabular">{completedSets}/{totalSets}</span>
            <span className="workout-active-stat-label">Sets</span>
          </div>
          {liveVolume > 0 && (
            <>
              <div className="workout-active-stat-divider" />
              <div className="workout-active-stat">
                <span className="workout-active-stat-value tabular">{formatVolume(liveVolume)}</span>
                <span className="workout-active-stat-label">Volume</span>
              </div>
            </>
          )}
        </div>
        <div className="workout-active-sync">
          <SyncStatus isPending={anySaving} isError={anyError} />
        </div>
      </header>

      <div className="workout-active-blocks">
        {detail?.workoutExercises.map((we, i) => (
          <ExerciseBlock
            key={we.id}
            we={we}
            units={units}
            onAddSet={handleAddSet}
            onUpdateSet={handleUpdateSet}
            onDeleteSet={handleDeleteSet}
            onMoveUp={() => handleMoveExercise(we.id, i, -1)}
            onMoveDown={() => handleMoveExercise(we.id, i, 1)}
            isFirst={i === 0}
            isLast={i === (detail?.workoutExercises.length ?? 1) - 1}
            hiddenSetIds={hiddenSetIds}
            previousSets={lastPerformed?.[we.exercise_id]}
          />
        ))}
        {detail != null && detail.workoutExercises.length === 0 && (
          <div className="workout-active-empty">
            <p className="meta">Add an exercise to start logging sets.</p>
          </div>
        )}
      </div>

      <footer className="workout-active-footer">
        <button
          type="button"
          className="btn-secondary workout-active-add-btn"
          onClick={() => setAddExerciseOpen(true)}
        >
          <PlusIcon size={18} strokeWidth={2.5} />
          Add exercise
        </button>
        <button
          type="button"
          className="btn-primary workout-active-finish-btn"
          onClick={() => setConfirmFinish(true)}
          disabled={finishWorkout.isPending}
        >
          Finish workout
        </button>
      </footer>

      <ExerciseSearchModal
        open={addExerciseOpen}
        onClose={() => setAddExerciseOpen(false)}
        workoutId={activeWorkout?.id}
        userId={user?.id}
        orderIndex={detail?.workoutExercises.length ?? 0}
      />

      <Sheet open={confirmFinish} onClose={() => setConfirmFinish(false)}>
        <div className="workout-finish-confirm">
          <div className="workout-finish-confirm-icon">
            <CheckIcon size={28} strokeWidth={2.5} />
          </div>
          <h3 className="workout-finish-confirm-title">
            Finish {detail?.workout.title ?? 'Workout'}?
          </h3>
          <div className="workout-finish-confirm-stats">
            <div className="workout-finish-confirm-stat">
              <span className="workout-finish-confirm-stat-value tabular">{elapsed}</span>
              <span className="workout-finish-confirm-stat-label">Duration</span>
            </div>
            <div className="workout-active-stat-divider" />
            <div className="workout-finish-confirm-stat">
              <span className="workout-finish-confirm-stat-value tabular">{completedSets}/{totalSets}</span>
              <span className="workout-finish-confirm-stat-label">Sets</span>
            </div>
            <div className="workout-active-stat-divider" />
            <div className="workout-finish-confirm-stat">
              <span className="workout-finish-confirm-stat-value tabular">{detail?.workoutExercises.length ?? 0}</span>
              <span className="workout-finish-confirm-stat-label">Exercises</span>
            </div>
          </div>
          {completedSets < totalSets && totalSets > 0 && (
            <p className="workout-finish-confirm-warning meta">
              {totalSets - completedSets} incomplete {totalSets - completedSets === 1 ? 'set' : 'sets'} will be saved as-is.
            </p>
          )}
          <button
            type="button"
            className="btn-primary workout-finish-confirm-btn"
            onClick={handleFinish}
            disabled={finishWorkout.isPending}
          >
            <CheckIcon size={18} strokeWidth={2.5} />
            Finish workout
          </button>
          <button
            type="button"
            className="btn-ghost workout-finish-confirm-back"
            onClick={() => setConfirmFinish(false)}
          >
            Keep going
          </button>
        </div>
      </Sheet>

      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <div className="workout-finish-confirm">
          <div className="workout-discard-icon">
            <XIcon size={28} strokeWidth={2.5} />
          </div>
          <h3 className="workout-finish-confirm-title">Discard workout?</h3>
          <p className="workout-finish-confirm-warning meta">
            This will permanently delete this session and all logged sets.
          </p>
          <button
            type="button"
            className="btn-danger workout-finish-confirm-btn"
            onClick={handleDiscard}
            disabled={deleteWorkout.isPending}
          >
            Discard workout
          </button>
          <button
            type="button"
            className="btn-ghost workout-finish-confirm-back"
            onClick={() => setConfirmDiscard(false)}
          >
            Keep going
          </button>
        </div>
      </Sheet>

      <Sheet open={summary != null} onClose={handleDismissSummary} title="Workout complete">
        {summary && (
          <div className="workout-summary">
            <div className="workout-summary-icon">
              <TrophyIllustration />
            </div>
            <div className="workout-summary-stats">
              <div className="workout-summary-stat">
                <span className="workout-summary-stat-value tabular">{summary.duration}</span>
                <span className="workout-summary-stat-label">Duration</span>
              </div>
              <div className="workout-summary-stat">
                <span className="workout-summary-stat-value tabular">{summary.completedSets}/{summary.totalSets}</span>
                <span className="workout-summary-stat-label">Sets</span>
              </div>
              {summary.volume > 0 && (
                <div className="workout-summary-stat">
                  <span className="workout-summary-stat-value tabular">
                    {formatVolume(summary.volume)}
                  </span>
                  <span className="workout-summary-stat-label">Volume</span>
                </div>
              )}
              {summary.prCount > 0 && (
                <div className="workout-summary-stat">
                  <span className="workout-summary-stat-value workout-summary-stat-value--pr tabular">{summary.prCount}</span>
                  <span className="workout-summary-stat-label">PRs</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDismissSummary}
            >
              Done
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
