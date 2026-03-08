import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useWorkoutWithExercises, useCreateWorkout } from '../lib/queries/workouts';
import type { WorkoutExerciseWithMeta } from '../lib/queries/workouts';
import { useDeleteWorkout } from '../lib/queries/sets';
import { useProfile } from '../lib/queries/profile';
import { formatDuration } from '../lib/format';
import { RepeatIcon } from '../components/Icons';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailSkeleton } from '../components/Skeleton';
import { useToast } from '../lib/useToast';
import './HistoryDetail.css';

function computeStats(workoutExercises: WorkoutExerciseWithMeta[]) {
  let totalSets = 0;
  let totalVolume = 0;
  const muscleGroups = new Set<string>();

  for (const we of workoutExercises) {
    if (we.exercise.muscle_group) muscleGroups.add(we.exercise.muscle_group);
    for (const s of we.sets) {
      if (!s.completed) continue;
      totalSets++;
      if (s.weight != null && s.reps != null) {
        totalVolume += s.weight * s.reps;
      }
    }
  }

  return { totalSets, totalVolume, muscleGroups: Array.from(muscleGroups) };
}

function formatVolume(vol: number): string {
  if (vol >= 1000) return `${(vol / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(vol));
}

export function HistoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: detail, isLoading } = useWorkoutWithExercises(id ?? undefined);
  const { data: profile } = useProfile(user?.id);
  const createWorkout = useCreateWorkout(user?.id);
  const deleteWorkout = useDeleteWorkout(user?.id);
  const { toast } = useToast();
  const units = profile?.units ?? 'kg';
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stats = useMemo(
    () => detail ? computeStats(detail.workoutExercises) : null,
    [detail],
  );

  async function handleRepeat() {
    if (!detail?.workout.id) return;
    await createWorkout.mutateAsync({
      title: detail.workout.title,
      copyFromWorkoutId: detail.workout.id,
    });
    navigate('/workout/active');
  }

  async function handleDelete() {
    if (!id) return;
    setConfirmDelete(false);
    try {
      await deleteWorkout.mutateAsync(id);
      toast('Workout deleted', 'success');
      navigate('/history');
    } catch {
      toast('Failed to delete workout', 'error');
    }
  }

  if (id == null) {
    return (
      <div className="hd">
        <Link to="/history" className="hd-back btn-ghost">← History</Link>
        <p className="meta">Invalid workout.</p>
      </div>
    );
  }

  if (isLoading || detail == null || stats == null) {
    return (
      <div className="hd">
        <Link to="/history" className="hd-back btn-ghost">← History</Link>
        <DetailSkeleton />
      </div>
    );
  }

  const { workout, workoutExercises } = detail;
  const duration = formatDuration(workout.started_at, workout.ended_at);
  const date = new Date(workout.started_at).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="hd">
      <Link to="/history" className="hd-back btn-ghost">← History</Link>

      {/* Summary card */}
      <header className="card hd-summary">
        <h1 className="hd-title">{workout.title}</h1>
        <span className="hd-date meta">{date}</span>

        <div className="hd-stats">
          <div className="hd-stat">
            <span className="hd-stat-value tabular">{duration}</span>
            <span className="hd-stat-label">Duration</span>
          </div>
          <div className="hd-stat-divider" />
          <div className="hd-stat">
            <span className="hd-stat-value tabular">{workoutExercises.length}</span>
            <span className="hd-stat-label">Exercises</span>
          </div>
          <div className="hd-stat-divider" />
          <div className="hd-stat">
            <span className="hd-stat-value tabular">{stats.totalSets}</span>
            <span className="hd-stat-label">Sets</span>
          </div>
          {stats.totalVolume > 0 && (
            <>
              <div className="hd-stat-divider" />
              <div className="hd-stat">
                <span className="hd-stat-value tabular">
                  {formatVolume(stats.totalVolume)}
                </span>
                <span className="hd-stat-label">Volume ({units})</span>
              </div>
            </>
          )}
        </div>

        {stats.muscleGroups.length > 0 && (
          <div className="hd-muscles">
            {stats.muscleGroups.map((mg) => (
              <span key={mg} className="hd-muscle-tag">{mg}</span>
            ))}
          </div>
        )}
      </header>

      {/* Exercises */}
      <div className="hd-exercises">
        {workoutExercises.map((we) => {
          const completedSets = we.sets.filter(
            (s) => s.completed && (s.weight != null || s.reps != null),
          );
          const bestSet = completedSets.reduce<{ weight: number; reps: number } | null>(
            (best, s) => {
              const vol = (s.weight ?? 0) * (s.reps ?? 0);
              if (!best) return { weight: s.weight ?? 0, reps: s.reps ?? 0 };
              const bestVol = best.weight * best.reps;
              return vol > bestVol ? { weight: s.weight ?? 0, reps: s.reps ?? 0 } : best;
            },
            null,
          );

          return (
            <div key={we.id} className="card hd-block">
              <div className="hd-block-header">
                <div className="hd-block-info">
                  <span className="hd-block-name">{we.exercise.name}</span>
                  {we.exercise.muscle_group != null && (
                    <span className="hd-block-muscle">{we.exercise.muscle_group}</span>
                  )}
                </div>
                {bestSet && bestSet.weight > 0 && (
                  <span className="hd-block-best meta tabular">
                    Best: {bestSet.weight} {units} x {bestSet.reps}
                  </span>
                )}
              </div>

              {completedSets.length > 0 ? (
                <div className="hd-sets">
                  <div className="hd-set hd-set-header">
                    <span className="hd-set-idx">Set</span>
                    <span className="hd-set-weight">Weight</span>
                    <span className="hd-set-reps">Reps</span>
                  </div>
                  {completedSets.map((s, i) => (
                    <div key={s.id} className="hd-set">
                      <span className="hd-set-idx tabular">{i + 1}</span>
                      <span className="hd-set-weight tabular">
                        {s.weight != null ? `${s.weight} ${units}` : '—'}
                      </span>
                      <span className="hd-set-reps tabular">
                        {s.reps != null ? s.reps : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hd-block-empty meta">No sets logged</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="hd-actions">
        <button
          type="button"
          className="btn-primary hd-action-btn"
          onClick={() => handleRepeat()}
          disabled={createWorkout.isPending}
        >
          <RepeatIcon size={18} />
          <span>Repeat workout</span>
        </button>
        <button
          type="button"
          className="btn-ghost btn-ghost--danger"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteWorkout.isPending}
        >
          Delete workout
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete workout"
        message={`This will permanently delete "${workout.title}" and all its data. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
