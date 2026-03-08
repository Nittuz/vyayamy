import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useCreateWorkout, useLastWorkout } from '../lib/queries/workouts';
import { useTemplates } from '../lib/queries/templates';
import { formatRelativeDate } from '../lib/format';
import './WorkoutStart.css';

export function WorkoutStart() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createWorkout = useCreateWorkout(user?.id);
  const { data: lastWorkout } = useLastWorkout(user?.id);
  const { data: templates } = useTemplates(user?.id);

  async function startEmpty() {
    const w = await createWorkout.mutateAsync({ title: 'Workout' });
    if (w) navigate('/workout/active');
  }

  async function repeatLast() {
    if (!lastWorkout) return;
    await createWorkout.mutateAsync({
      title: lastWorkout.title,
      copyFromWorkoutId: lastWorkout.id,
    });
    navigate('/workout/active');
  }

  async function startFromRoutine(templateId: string, name: string, exerciseOrder: string[]) {
    await createWorkout.mutateAsync({
      title: name,
      templateId,
      exerciseIds: exerciseOrder,
    });
    navigate('/workout/active');
  }

  return (
    <div className="workout-start">
      <h1 className="page-title">Start workout</h1>
      <p className="workout-start-subtitle meta">Choose how to begin.</p>

      <div className="workout-start-options">
        <button
          type="button"
          className="card workout-start-option"
          onClick={() => startEmpty()}
          disabled={createWorkout.isPending}
        >
          <span className="workout-start-option-title">Empty workout</span>
          <span className="workout-start-option-desc meta">Start from scratch</span>
        </button>

        {lastWorkout != null && (
          <button
            type="button"
            className="card workout-start-option"
            onClick={() => repeatLast()}
            disabled={createWorkout.isPending}
          >
            <span className="workout-start-option-title">{lastWorkout.title}</span>
            <span className="workout-start-option-desc meta">
              Repeat · {formatRelativeDate(lastWorkout.started_at).toLowerCase()}
            </span>
          </button>
        )}
      </div>

      {templates != null && templates.length > 0 && (
        <section className="workout-start-routines">
          <h2 className="section-title">Routines</h2>
          <div className="workout-start-routine-list">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="card workout-start-routine"
                onClick={() => startFromRoutine(t.id, t.name, t.exercise_order)}
                disabled={createWorkout.isPending}
              >
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
