import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useHistoryWorkouts } from '../lib/queries/history';
import type { HistoryWorkout } from '../lib/queries/history';
import { formatDuration, formatShortDate, getDateGroup } from '../lib/format';
import { ChevronRightIcon } from '../components/Icons';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState, CalendarIllustration } from '../components/EmptyState';
import './History.css';

type Period = 'all' | 'month' | '3months' | 'year';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'month', label: 'Month' },
  { id: '3months', label: '3 mo' },
  { id: 'year', label: 'Year' },
];

function groupByDate(workouts: HistoryWorkout[]): { label: string; workouts: HistoryWorkout[] }[] {
  const groups: Map<string, HistoryWorkout[]> = new Map();
  for (const w of workouts) {
    const label = getDateGroup(w.started_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(w);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    workouts: items,
  }));
}

export function History() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('all');
  const { data: workouts, isLoading } = useHistoryWorkouts(user?.id, {
    period: period === 'all' ? undefined : period,
  });

  const grouped = useMemo(
    () => groupByDate(workouts ?? []),
    [workouts],
  );

  const totalCount = workouts?.length ?? 0;

  return (
    <div className="history">
      <header className="history-header">
        <h1 className="page-title">History</h1>
        {!isLoading && totalCount > 0 && (
          <span className="history-total meta">
            {totalCount} {totalCount === 1 ? 'workout' : 'workouts'}
          </span>
        )}
      </header>

      <div className="history-filters">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={
              'chip' + (period === p.id ? ' chip--active' : '')
            }
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : grouped.length > 0 ? (
        <div className="history-groups">
          {grouped.map((group) => (
            <section key={group.label} className="history-group">
              <h2 className="history-group-label">{group.label}</h2>
              <div className="history-group-cards">
                {group.workouts.map((w) => (
                  <Link
                    key={w.id}
                    to={`/history/${w.id}`}
                    className="card history-card"
                  >
                    <div className="history-card-top">
                      <div className="history-card-main">
                        <span className="history-card-title">{w.title}</span>
                        <span className="history-card-date meta">
                          {formatShortDate(w.started_at)}
                        </span>
                      </div>
                      <ChevronRightIcon size={16} className="history-card-chevron" />
                    </div>
                    <div className="history-card-bottom">
                      <div className="history-card-tags">
                        {w.muscleGroups.length > 0 ? (
                          w.muscleGroups.map((mg) => (
                            <span key={mg} className="tag">{mg}</span>
                          ))
                        ) : (
                          w.exerciseCount > 0 && (
                            <span className="tag tag--muted">
                              {w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}
                            </span>
                          )
                        )}
                      </div>
                      <span className="history-card-duration meta tabular">
                        {formatDuration(w.started_at, w.ended_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarIllustration />}
          message="Your training journal will appear here after your first session."
          actionLabel="Start workout"
          actionTo="/"
        />
      )}
    </div>
  );
}
