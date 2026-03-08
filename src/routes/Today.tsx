import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useProfile } from '../lib/queries/profile';
import { useActiveWorkout, useLastWorkout, useRecentWorkouts, useCreateWorkout } from '../lib/queries/workouts';
import { useTemplates } from '../lib/queries/templates';
import { useWeeklyFrequency } from '../lib/queries/records';
import { formatRelativeDate, formatDuration, getGreeting } from '../lib/format';
import { PlayIcon, RepeatIcon, ChevronRightIcon } from '../components/Icons';
import { EmptyState, DumbbellIllustration } from '../components/EmptyState';
import { TodaySkeleton } from '../components/Skeleton';
import './Today.css';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getWeekDays(): Date[] {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function Today() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);
  const { data: activeWorkout } = useActiveWorkout(user?.id);
  const { data: lastWorkout } = useLastWorkout(user?.id);
  const { data: recentWorkouts, isLoading: recentsLoading } = useRecentWorkouts(user?.id, 10);
  const { data: templates } = useTemplates(user?.id);
  const createWorkout = useCreateWorkout(user?.id);
  const { data: weeklyFreq } = useWeeklyFrequency(user?.id, 1);

  const thisWeekCount = weeklyFreq?.[0]?.count ?? 0;

  const firstName = profile?.display_name?.split(/\s+/)[0];
  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();

  const lastTrainedText = lastWorkout
    ? `Last trained ${formatRelativeDate(lastWorkout.started_at).toLowerCase()}`
    : null;

  const weekDays = getWeekDays();
  const todayKey = dateKey(new Date());
  const trainedDays = new Set(
    (recentWorkouts ?? []).map((w) => dateKey(new Date(w.started_at))),
  );

  const isInitialLoad = profileLoading && recentsLoading;
  const displayWorkouts = recentWorkouts?.slice(0, 5) ?? [];
  const displayTemplates = templates?.slice(0, 4) ?? [];

  async function handleStartEmpty() {
    const w = await createWorkout.mutateAsync({ title: 'Workout' });
    if (w) navigate('/workout/active');
  }

  async function handleRepeatLast() {
    if (!lastWorkout) return;
    await createWorkout.mutateAsync({
      title: lastWorkout.title,
      copyFromWorkoutId: lastWorkout.id,
    });
    navigate('/workout/active');
  }

  async function handleStartFromTemplate(template: { id: string; name: string; exercise_order: string[] }) {
    await createWorkout.mutateAsync({
      title: template.name,
      templateId: template.id,
      exerciseIds: template.exercise_order,
    });
    navigate('/workout/active');
  }

  if (isInitialLoad) {
    return (
      <div className="today">
        <TodaySkeleton />
      </div>
    );
  }

  return (
    <div className="today">
      <header className="today-header">
        <h1 className="page-title">{greeting}</h1>
        {lastTrainedText && (
          <p className="today-context meta">{lastTrainedText}</p>
        )}
      </header>

      {/* Actions */}
      <section className="today-actions">
        {activeWorkout != null ? (
          <Link to="/workout/active" className="btn-primary today-action-btn">
            <PlayIcon size={18} />
            <span>Resume workout</span>
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary today-action-btn"
              onClick={() => handleStartEmpty()}
              disabled={createWorkout.isPending}
            >
              <PlayIcon size={18} />
              <span>Start workout</span>
            </button>
            {lastWorkout != null && (
              <button
                type="button"
                className="btn-secondary today-action-btn"
                onClick={() => handleRepeatLast()}
                disabled={createWorkout.isPending}
              >
                <RepeatIcon size={18} />
                <span>Repeat last session</span>
              </button>
            )}
          </>
        )}
      </section>

      {/* Week strip */}
      <section className="card today-week-card">
        <div className="today-week-header">
          <span className="today-week-title">This week</span>
          <span className="today-week-count meta">
            {thisWeekCount} {thisWeekCount === 1 ? 'workout' : 'workouts'}
          </span>
        </div>
        <div className="today-week-strip">
          {weekDays.map((day, i) => {
            const key = dateKey(day);
            const trained = trainedDays.has(key);
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className={
                  'today-day' +
                  (trained ? ' today-day--active' : '') +
                  (isToday ? ' today-day--today' : '')
                }
              >
                <span className="today-day-label">{DAY_LABELS[i]}</span>
                <span className="today-day-dot" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick start from routines */}
      <section className="today-section">
        <div className="today-section-header">
          <h2 className="section-title">Quick start</h2>
          <Link to="/profile/routines" className="today-see-all meta">
            Manage <ChevronRightIcon size={14} />
          </Link>
        </div>
        {displayTemplates.length > 0 ? (
          <div className="today-routines">
            {displayTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="today-routine-chip"
                onClick={() => handleStartFromTemplate(t)}
                disabled={createWorkout.isPending}
              >
                <span className="today-routine-chip-name">{t.name}</span>
                {t.exercise_order.length > 0 && (
                  <span className="today-routine-chip-count">
                    {t.exercise_order.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="today-routines">
            <Link to="/profile/routines" className="today-routine-chip today-routine-chip--create">
              <span className="today-routine-chip-name">+ Create a routine</span>
            </Link>
          </div>
        )}
      </section>

      {/* Recent */}
      <section className="today-section">
        <div className="today-section-header">
          <h2 className="section-title">Recent</h2>
          {displayWorkouts.length > 0 && (
            <Link to="/history" className="today-see-all meta">
              See all <ChevronRightIcon size={14} />
            </Link>
          )}
        </div>
        {displayWorkouts.length > 0 ? (
          <div className="card today-recent-card">
            <ul className="today-list">
              {displayWorkouts.map((w) => (
                <li key={w.id}>
                  <Link to={`/history/${w.id}`} className="today-list-item">
                    <div className="today-list-item-main">
                      <span className="card-title">{w.title}</span>
                      <span className="meta">
                        {formatRelativeDate(w.started_at)}
                      </span>
                    </div>
                    <span className="today-list-duration tabular">
                      {formatDuration(w.started_at, w.ended_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<DumbbellIllustration />}
            message="Ready for your first workout? Your training history will show up here."
          />
        )}
      </section>
    </div>
  );
}
