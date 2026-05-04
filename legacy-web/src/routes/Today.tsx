import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useProfile } from '../lib/queries/profile';
import { useActiveWorkout, useLastWorkout, useRecentWorkouts, useCreateWorkout } from '../lib/queries/workouts';
import { useTemplates } from '../lib/queries/templates';
import { useActivePlan, useWeekCompletions, getTodaySlot, isSlotCompletedOnDate, getUpcomingSlots } from '../lib/queries/plans';
import { useWeeklyFrequency } from '../lib/queries/records';
import { track } from '../lib/analytics';
import { formatRelativeDate, formatDuration, getGreeting } from '../lib/format';
import { CalendarIcon, ChevronRightIcon, RepeatIcon, PlusIcon, XIcon } from '../components/Icons';
import { TodayHero } from '../components/TodayHero';
import { WeekStrip } from '../components/WeekStrip';
import { EmptyState, DumbbellIllustration } from '../components/EmptyState';
import { TodaySkeleton } from '../components/Skeleton';
import { useToast } from '../lib/useToast';
import './Today.css';

const ONBOARDING_DISMISSED_KEY = 'vyayamy_onboarding_dismissed';

function useOnboardingCard(hasWorkouts: boolean) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1',
  );
  const visible = !dismissed && !hasWorkouts;
  const dismiss = useCallback(() => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    setDismissed(true);
    track({ name: 'onboarding_dismissed' });
  }, []);
  return { visible, dismiss };
}

export function Today() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
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
  const hasWorkouts = displayWorkouts.length > 0 || !!activeWorkout;
  const onboarding = useOnboardingCard(hasWorkouts);

  async function handleStartEmpty() {
    try {
      const w = await createWorkout.mutateAsync({ title: 'Workout' });
      if (w) {
        track({ name: 'workout_started', properties: { source: 'custom' } });
        navigate('/workout/active');
      }
    } catch {
      toast('Failed to start workout. Please try again.', 'error');
    }
  }

  async function handleRepeatLast() {
    if (!lastWorkout) return;
    try {
      await createWorkout.mutateAsync({
        title: lastWorkout.title,
        copyFromWorkoutId: lastWorkout.id,
      });
      track({ name: 'workout_started', properties: { source: 'repeat' } });
      navigate('/workout/active');
    } catch {
      toast('Failed to start workout. Please try again.', 'error');
    }
  }

  async function handleStartFromTemplate(template: { id: string; name: string; exercise_order: string[] }) {
    try {
      await createWorkout.mutateAsync({
        title: template.name,
        templateId: template.id,
        exerciseIds: template.exercise_order,
      });
      track({ name: 'workout_started', properties: { source: 'template' } });
      navigate('/workout/active');
    } catch {
      toast('Failed to start workout. Please try again.', 'error');
    }
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

      {/* First-run onboarding card */}
      {onboarding.visible && (
        <section className="today-onboarding card">
          <button
            type="button"
            className="today-onboarding-dismiss"
            onClick={onboarding.dismiss}
            aria-label="Dismiss"
          >
            <XIcon size={16} />
          </button>
          <h2 className="today-onboarding-title">Your workout journal</h2>
          <p className="today-onboarding-body">
            Log sets, track personal records, and see your progress over time.
            Start with a free workout, or set up a training plan to follow a schedule.
          </p>
        </section>
      )}

      {/* 3. Week strip */}
      <WeekStrip
        plan={plan ?? null}
        weekCompletions={weekCompletions ?? []}
        recentWorkouts={recentWorkouts ?? []}
        weeklyCount={thisWeekCount}
      />

      {/* 4. Plan context */}
      {plan ? (
        <section className="today-plan-context">
          <Link to="/plan" className="today-plan-link">
            <div className="today-plan-link-info">
              <h2 className="today-plan-link-name">{plan.name}</h2>
              {upcomingWithNames.length > 0 && (
                <span className="today-plan-link-upcoming">
                  Up next: {upcomingWithNames.map(({ slot, template }) =>
                    template?.name ?? (slot.is_rest_day ? 'Rest' : 'Workout')
                  ).join(', ')}
                </span>
              )}
            </div>
            <ChevronRightIcon size={14} />
          </Link>
        </section>
      ) : (
        <section className="today-plan-context">
          <Link to="/plan" className="today-plan-nudge-card card">
            <CalendarIcon size={18} />
            <div className="today-plan-nudge-content">
              <span className="today-plan-nudge-title">Create a training plan</span>
              <span className="meta">Schedule your workouts for the week</span>
            </div>
            <ChevronRightIcon size={14} />
          </Link>
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
            actionLabel="Start your first workout"
            onAction={handleStartEmpty}
          />
        )}
      </section>
    </div>
  );
}
