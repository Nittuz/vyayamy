import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useProfile } from '../lib/queries/profile';
import { useActiveWorkout, useLastWorkout, useRecentWorkouts, useCreateWorkout } from '../lib/queries/workouts';
import { useTemplates } from '../lib/queries/templates';
import { useActivePlan, useWeekCompletions, getTodaySlot, isSlotCompletedOnDate, getUpcomingSlots } from '../lib/queries/plans';
import { useWeeklyFrequency } from '../lib/queries/records';
import { formatRelativeDate, formatDuration, getGreeting } from '../lib/format';
import { ChevronRightIcon, RepeatIcon, PlusIcon } from '../components/Icons';
import { TodayHero } from '../components/TodayHero';
import { WeekStrip } from '../components/WeekStrip';
import { EmptyState, DumbbellIllustration } from '../components/EmptyState';
import { TodaySkeleton } from '../components/Skeleton';
import './Today.css';

export function Today() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);
  const { data: activeWorkout } = useActiveWorkout(user?.id);
  const { data: lastWorkout } = useLastWorkout(user?.id);
  const { data: recentWorkouts, isLoading: recentsLoading } = useRecentWorkouts(user?.id, 5);
  const { data: templates } = useTemplates(user?.id);
  const { data: plan } = useActivePlan(user?.id);
  const { data: weekCompletions } = useWeekCompletions(user?.id);
  const createWorkout = useCreateWorkout(user?.id);
  const { data: weeklyFreq } = useWeeklyFrequency(user?.id, 1);

  const thisWeekCount = weeklyFreq?.[0]?.count ?? 0;

  const todaySlot = plan ? getTodaySlot(plan) : null;
  const todayCompleted = todaySlot && weekCompletions
    ? isSlotCompletedOnDate(todaySlot, weekCompletions, new Date())
    : false;
  const templateMap = new Map(templates?.map((t) => [t.id, t]) ?? []);
  const plannedTemplate = todaySlot?.template_id ? templateMap.get(todaySlot.template_id) : null;

  const upcoming = plan ? getUpcomingSlots(plan, 2) : [];
  const upcomingWithNames = upcoming.map((s) => ({
    slot: s,
    template: s.template_id ? templateMap.get(s.template_id) : null,
  }));

  const firstName = profile?.display_name?.split(/\s+/)[0];
  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();

  const displayWorkouts = recentWorkouts?.slice(0, 3) ?? [];
  const displayTemplates = templates?.filter((t) => t.id !== plannedTemplate?.id) ?? [];

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

  if (profileLoading && recentsLoading) {
    return (
      <div className="today">
        <TodaySkeleton />
      </div>
    );
  }

  return (
    <div className="today">
      {/* 1. Header — quiet greeting */}
      <header className="today-header">
        <h1 className="today-greeting">{greeting}</h1>
      </header>

      {/* 2. Hero — single dominant CTA */}
      <TodayHero
        activeWorkout={activeWorkout ?? null}
        plan={plan ?? null}
        todaySlot={todaySlot}
        todayCompleted={todayCompleted}
        plannedTemplate={plannedTemplate ?? null}
        isPending={createWorkout.isPending}
        onStartPlanned={() => plannedTemplate && handleStartFromTemplate(plannedTemplate)}
        onStartEmpty={handleStartEmpty}
      />

      {/* 3. Week strip */}
      <WeekStrip
        plan={plan ?? null}
        weekCompletions={weekCompletions ?? []}
        recentWorkouts={recentWorkouts ?? []}
        weeklyCount={thisWeekCount}
      />

      {/* 4. Plan context — quiet, informational */}
      {plan && (
        <section className="today-plan-context">
          <div className="today-section-header">
            <h2 className="today-section-label">{plan.name}</h2>
            <Link to="/profile/plan" className="today-section-link meta">
              View plan <ChevronRightIcon size={14} />
            </Link>
          </div>
          {upcomingWithNames.length > 0 && (
            <div className="today-upcoming">
              <span className="today-upcoming-label">Coming up</span>
              {upcomingWithNames.map(({ slot, template }, i) => (
                <span key={slot.id ?? i} className="today-upcoming-item">
                  {template?.name ?? (slot.is_rest_day ? 'Rest' : 'Workout')}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. Train something else */}
      <section className="today-section">
        <div className="today-section-header">
          <h2 className="today-section-label">Train something else</h2>
        </div>
        <div className="today-alt-actions">
          <button
            type="button"
            className="today-alt-chip today-alt-chip--custom"
            onClick={handleStartEmpty}
            disabled={createWorkout.isPending}
          >
            <PlusIcon size={14} />
            <span>Custom workout</span>
          </button>
          {lastWorkout && !activeWorkout && (
            <button
              type="button"
              className="today-alt-chip"
              onClick={handleRepeatLast}
              disabled={createWorkout.isPending}
            >
              <RepeatIcon size={14} />
              <span>Repeat last session</span>
            </button>
          )}
          {displayTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="today-alt-chip"
              onClick={() => handleStartFromTemplate(t)}
              disabled={createWorkout.isPending}
            >
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 6. Recent workouts */}
      <section className="today-section">
        <div className="today-section-header">
          <h2 className="today-section-label">Recent</h2>
          {displayWorkouts.length > 0 && (
            <Link to="/history" className="today-section-link meta">
              See all <ChevronRightIcon size={14} />
            </Link>
          )}
        </div>
        {displayWorkouts.length > 0 ? (
          <ul className="today-recent-list">
            {displayWorkouts.map((w) => (
              <li key={w.id}>
                <Link to={`/history/${w.id}`} className="today-recent-item">
                  <div className="today-recent-item-main">
                    <span className="today-recent-title">{w.title}</span>
                    <span className="meta">{formatRelativeDate(w.started_at)}</span>
                  </div>
                  <span className="today-recent-duration tabular">
                    {formatDuration(w.started_at, w.ended_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<DumbbellIllustration />}
            message="Your training history will appear here."
          />
        )}
      </section>
    </div>
  );
}
