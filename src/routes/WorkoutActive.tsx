import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/useAuth';
import { useActiveWorkout, useWorkoutWithExercises } from '../lib/queries/workouts';
import { useProfile } from '../lib/queries/profile';
import { useAddSet, useUpdateSet, useDeleteSet, useFinishWorkout, useReorderExercise } from '../lib/queries/sets';
import { useActivePlan, useAdvanceCycle, getTodaySlot } from '../lib/queries/plans';
import { detectAndInsertPRs } from '../lib/pr-detection';
import { ExerciseBlock } from '../components/ExerciseBlock';
import { PlusIcon, CheckIcon } from '../components/Icons';
import { ExerciseSearchModal } from '../components/ExerciseSearchModal';
import { Sheet } from '../components/Sheet';
import { useToast } from '../lib/useToast';
import { TrophyIllustration } from '../components/EmptyState';
import './WorkoutActive.css';

function useElapsedTime(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState('0m');
  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const mins = Math.floor(
        (Date.now() - new Date(startedAt).getTime()) / 60000
      );
      if (mins < 60) {
        setElapsed(`${mins}m`);
      } else {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        setElapsed(m ? `${h}h ${m}m` : `${h}h`);
      }
    };
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
  const { data: activeWorkout } = useActiveWorkout(user?.id);
  const { data: detail, isLoading } = useWorkoutWithExercises(activeWorkout?.id);
  const addSet = useAddSet(activeWorkout?.id);
  const updateSet = useUpdateSet(activeWorkout?.id);
  const deleteSet = useDeleteSet(activeWorkout?.id);
  const finishWorkout = useFinishWorkout(user?.id);
  const reorderExercise = useReorderExercise(activeWorkout?.id);
  const { data: activePlan } = useActivePlan(user?.id);
  const advanceCycle = useAdvanceCycle(user?.id);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [hiddenSetIds, setHiddenSetIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{
    sets: number;
    total: number;
    volume: number;
    prs: number;
    duration: string;
  } | null>(null);
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { toast } = useToast();

  const elapsed = useElapsedTime(detail?.workout.started_at);
  const shouldRedirect = activeWorkout == null && !isLoading;

  useEffect(() => {
    if (shouldRedirect) navigate('/');
  }, [shouldRedirect, navigate]);

  if (shouldRedirect) return null;

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
    reorderExercise.mutate({
      sourceId: weId,
      targetId: targetWe.id,
      sourceIndex: currentIndex,
      targetIndex,
    });
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

      let volume = 0;
      for (const we of detail.workoutExercises) {
        for (const s of we.sets) {
          if (s.completed && s.weight != null && s.reps != null) {
            volume += s.weight * s.reps;
          }
        }
      }

      setSummary({
        sets: completedSets,
        total: totalSets,
        volume,
        prs: prCount,
        duration: elapsed,
      });
    } catch {
      toast('Failed to save workout', 'error');
    }
  };

  const handleDismissSummary = () => {
    setSummary(null);
    setCompleting(true);
    setTimeout(() => navigate('/'), 500);
  };

  const completedSets =
    detail?.workoutExercises.reduce(
      (sum, we) => sum + we.sets.filter((s) => s.completed && !hiddenSetIds.has(s.id)).length,
      0
    ) ?? 0;
  const totalSets =
    detail?.workoutExercises.reduce(
      (sum, we) => sum + we.sets.filter((s) => !hiddenSetIds.has(s.id)).length,
      0
    ) ?? 0;

  const liveVolume = useMemo(() => {
    if (!detail) return 0;
    let vol = 0;
    for (const we of detail.workoutExercises) {
      for (const s of we.sets) {
        if (s.completed && s.weight != null && s.reps != null && !hiddenSetIds.has(s.id)) {
          vol += s.weight * s.reps;
        }
      }
    }
    return vol;
  }, [detail, hiddenSetIds]);

  const progressPct = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const formatVolume = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(v);

  return (
    <div className={'workout-active' + (completing ? ' workout-active--completing' : '')}>
      <header className="workout-active-header">
        <h1 className="workout-active-title">
          {detail?.workout.title ?? 'Workout'}
        </h1>
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
                <span className="workout-summary-stat-value tabular">{summary.sets}/{summary.total}</span>
                <span className="workout-summary-stat-label">Sets</span>
              </div>
              {summary.volume > 0 && (
                <div className="workout-summary-stat">
                  <span className="workout-summary-stat-value tabular">
                    {summary.volume >= 1000
                      ? `${(summary.volume / 1000).toFixed(1).replace(/\.0$/, '')}k`
                      : summary.volume}
                  </span>
                  <span className="workout-summary-stat-label">Volume</span>
                </div>
              )}
              {summary.prs > 0 && (
                <div className="workout-summary-stat">
                  <span className="workout-summary-stat-value workout-summary-stat-value--pr tabular">{summary.prs}</span>
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
