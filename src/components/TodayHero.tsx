import { Link } from 'react-router-dom';
import type { Workout, TrainingPlanSlot, Template } from '../types/database';
import type { PlanWithSlots } from '../lib/queries/plans';
import { PlayIcon, CheckIcon, MoonIcon, ArrowRightIcon } from './Icons';
import './TodayHero.css';

type TodayHeroProps = {
  activeWorkout: Workout | null;
  plan: PlanWithSlots | null;
  todaySlot: TrainingPlanSlot | null;
  todayCompleted: boolean;
  plannedTemplate: Template | null;
  isPending: boolean;
  onStartPlanned: () => void;
  onStartEmpty: () => void;
};

function elapsedSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just started';
  if (mins < 60) return `${mins}m elapsed`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m elapsed` : `${h}h elapsed`;
}

// TODO Phase 3: show plan adherence rate or streak badge in hero
export function TodayHero({
  activeWorkout,
  plan,
  todaySlot,
  todayCompleted,
  plannedTemplate,
  isPending,
  onStartPlanned,
  onStartEmpty,
}: TodayHeroProps) {
  if (activeWorkout) {
    return (
      <section className="hero hero--active">
        <span className="hero-overline">In progress</span>
        <h2 className="hero-title">{activeWorkout.title}</h2>
        <p className="hero-meta">{elapsedSince(activeWorkout.started_at)}</p>
        <Link to="/workout/active" className="btn-primary hero-cta">
          Resume workout
          <ArrowRightIcon size={18} />
        </Link>
      </section>
    );
  }

  if (plan && todaySlot) {
    if (todaySlot.is_rest_day) {
      return (
        <section className="hero hero--rest">
          <div className="hero-rest-icon" aria-hidden="true">
            <MoonIcon size={28} />
          </div>
          <span className="hero-overline">Today</span>
          <h2 className="hero-title">Rest day</h2>
          <p className="hero-meta">
            {todaySlot.label || 'No workout scheduled.'}
          </p>
        </section>
      );
    }

    if (todayCompleted) {
      return (
        <section className="hero hero--done">
          <div className="hero-done-badge" aria-hidden="true">
            <CheckIcon size={20} strokeWidth={2.5} />
          </div>
          <span className="hero-overline">Today</span>
          <h2 className="hero-title">You're done</h2>
          <p className="hero-meta">
            {plannedTemplate?.name ?? 'Workout'} complete. Nice work.
          </p>
          <button
            type="button"
            className="btn-ghost hero-ghost-link"
            onClick={onStartEmpty}
            disabled={isPending}
          >
            Start another
          </button>
        </section>
      );
    }

    if (plannedTemplate) {
      const count = plannedTemplate.exercise_order.length;
      return (
        <section className="hero hero--scheduled">
          <span className="hero-overline">Today's workout</span>
          <h2 className="hero-title">{plannedTemplate.name}</h2>
          {count > 0 && (
            <p className="hero-meta">
              {count} exercise{count !== 1 ? 's' : ''}
            </p>
          )}
          <button
            type="button"
            className="btn-primary hero-cta"
            onClick={onStartPlanned}
            disabled={isPending}
          >
            Begin {plannedTemplate.name}
            <ArrowRightIcon size={18} />
          </button>
        </section>
      );
    }

    // Slot exists but has no template assigned
    return (
      <section className="hero hero--empty">
        <span className="hero-overline">Today</span>
        <h2 className="hero-title">{todaySlot.label || 'Workout scheduled'}</h2>
        <p className="hero-meta">This slot needs a template assigned.</p>
        <Link to="/plan/setup" className="btn-secondary hero-cta">
          Edit plan
        </Link>
      </section>
    );
  }

  // No plan, or plan with no slot for today
  return (
    <section className="hero hero--empty">
      <span className="hero-overline">Today</span>
      <h2 className="hero-title">Ready to train?</h2>
      <p className="hero-meta">
        {plan ? 'No workout scheduled today.' : 'Start a workout or set up a plan.'}
      </p>
      <button
        type="button"
        className="btn-primary hero-cta"
        onClick={onStartEmpty}
        disabled={isPending}
      >
        <PlayIcon size={18} />
        Start workout
      </button>
      {!plan && (
        <Link to="/plan" className="hero-plan-nudge">
          Set up a training plan
        </Link>
      )}
    </section>
  );
}
