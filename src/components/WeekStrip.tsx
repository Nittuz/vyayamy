import type { Workout } from '../types/database';
import type { PlanWithSlots } from '../lib/queries/plans';
import './WeekStrip.css';

type WeekStripProps = {
  plan: PlanWithSlots | null;
  weekCompletions: Workout[];
  recentWorkouts: Workout[];
  weeklyCount: number;
};

type DayState = 'completed' | 'today' | 'today-done' | 'planned' | 'rest' | 'missed' | 'empty';

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

function computeDayState(
  day: Date,
  dayIndex: number,
  isToday: boolean,
  isTrained: boolean,
  plan: PlanWithSlots | null,
): DayState {
  const slotForDay = plan?.slots.find((s) => {
    if (plan.plan_type === 'weekly') return s.day_of_week === dayIndex;
    return false;
  });
  const isScheduled = slotForDay != null && !slotForDay.is_rest_day;
  const isRest = slotForDay?.is_rest_day ?? false;
  const isPast = day.getTime() < new Date(new Date().toDateString()).getTime();

  if (isToday) {
    return isTrained ? 'today-done' : 'today';
  }

  if (isPast) {
    if (isTrained) return 'completed';
    if (isScheduled) return 'missed';
    return isRest ? 'rest' : 'empty';
  }

  if (isScheduled) return 'planned';
  if (isRest) return 'rest';
  return 'empty';
}

export function WeekStrip({ plan, weekCompletions, recentWorkouts, weeklyCount }: WeekStripProps) {
  const weekDays = getWeekDays();
  const todayKey = dateKey(new Date());
  const allWorkouts = [...(weekCompletions ?? []), ...(recentWorkouts ?? [])];
  const trainedDays = new Set(allWorkouts.map((w) => dateKey(new Date(w.started_at))));

  return (
    <section className="week-strip card">
      <div className="week-strip-header">
        <span className="week-strip-label">This week</span>
        <span className="week-strip-count meta">
          {weeklyCount} {weeklyCount === 1 ? 'session' : 'sessions'}
        </span>
      </div>
      <div className="week-strip-days">
        {weekDays.map((day, i) => {
          const key = dateKey(day);
          const isToday = key === todayKey;
          const isTrained = trainedDays.has(key);
          const state = computeDayState(day, i, isToday, isTrained, plan);

          return (
            <div key={i} className={`week-day week-day--${state}`}>
              <span className="week-day-label">{DAY_LABELS[i]}</span>
              <span className="week-day-indicator" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
