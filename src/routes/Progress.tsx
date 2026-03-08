import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useAuth } from '../lib/useAuth';
import {
  usePersonalRecords,
  useExerciseHistory,
  useWeeklyFrequency,
} from '../lib/queries/records';
import { useProfile } from '../lib/queries/profile';
import { useGlobalExercises } from '../lib/queries/exercises';
import {
  useRecentExerciseIds,
  useExercisesByIds,
} from '../lib/queries/exercises';
import type { PersonalRecord, Exercise } from '../types/database';
import { EmptyState, TrophyIllustration, ChartIllustration, DumbbellIllustration } from '../components/EmptyState';
import './Progress.css';

const PR_TYPE_LABELS: Record<string, string> = {
  heaviest_weight: 'Heaviest',
  best_volume: 'Best Volume',
  most_reps_at_weight: 'Best Set',
};

const PR_TYPE_ORDER = ['heaviest_weight', 'most_reps_at_weight', 'best_volume'];

function formatPrValue(pr: PersonalRecord, units: string): string {
  const v = pr.value;
  if (pr.type === 'heaviest_weight' && typeof v === 'number') {
    return `${v} ${units}`;
  }
  if (pr.type === 'best_volume' && typeof v === 'number') {
    if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k ${units}`;
    return `${v} ${units}`;
  }
  if (
    v != null &&
    typeof v === 'object' &&
    'weight' in v &&
    'reps' in v
  ) {
    const obj = v as { weight: number; reps: number };
    return `${obj.weight} ${units} x ${obj.reps}`;
  }
  return String(v);
}

function isRecentPR(achievedAt: string): boolean {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  return new Date(achievedAt) > oneDayAgo;
}

type GroupedPR = {
  exerciseId: string;
  exercise: Exercise | undefined;
  records: PersonalRecord[];
  hasNew: boolean;
};

function deduplicateByType(records: PersonalRecord[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const pr of records) {
    const existing = best.get(pr.type);
    if (!existing || pr.achieved_at > existing.achieved_at) {
      best.set(pr.type, pr);
    }
  }
  return Array.from(best.values());
}

function groupPrsByExercise(
  prs: PersonalRecord[],
  exerciseMap: Map<string, Exercise>,
): GroupedPR[] {
  const groups = new Map<string, PersonalRecord[]>();
  for (const pr of prs) {
    if (!groups.has(pr.exercise_id)) groups.set(pr.exercise_id, []);
    groups.get(pr.exercise_id)!.push(pr);
  }
  const result: GroupedPR[] = [];
  for (const [exerciseId, rawRecords] of groups) {
    const records = deduplicateByType(rawRecords);
    records.sort((a, b) => {
      const ai = PR_TYPE_ORDER.indexOf(a.type);
      const bi = PR_TYPE_ORDER.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    result.push({
      exerciseId,
      exercise: exerciseMap.get(exerciseId),
      records,
      hasNew: records.some((r) => isRecentPR(r.achieved_at)),
    });
  }
  result.sort((a, b) => {
    if (a.hasNew !== b.hasNew) return a.hasNew ? -1 : 1;
    const aDate = a.records[0]?.achieved_at ?? '';
    const bDate = b.records[0]?.achieved_at ?? '';
    return bDate.localeCompare(aDate);
  });
  return result;
}

export function Progress() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const units = profile?.units ?? 'kg';
  const { data: prs } = usePersonalRecords(user?.id);
  const { data: weeklyFreq } = useWeeklyFrequency(user?.id, 6);
  const { data: globalExercises } = useGlobalExercises(30);
  const recentIds = useRecentExerciseIds(user?.id, 10);
  const recentExercises = useExercisesByIds(recentIds.data ?? []);
  const exerciseOptions = [
    ...(recentExercises.data ?? []),
    ...(globalExercises ?? []),
  ];
  const byId = new Map(exerciseOptions.map((e) => [e.id, e]));
  const uniqueExercises = Array.from(byId.values());
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    uniqueExercises[0]?.id ?? null,
  );
  const { data: history } = useExerciseHistory(
    user?.id,
    selectedExerciseId ?? undefined,
  );

  const groupedPrs = useMemo(
    () => groupPrsByExercise(prs ?? [], byId),
    [prs, byId],
  );

  const chartData =
    history != null && history.length > 0
      ? history.map((p) => ({
          date: new Date(p.date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          }),
          weight: p.weight ?? p.estimated1Rm,
          volume: p.volume,
        }))
      : [];

  return (
    <div className="progress">
      <h1 className="page-title">Progress</h1>

      {/* Personal Records */}
      <section className="pg-section">
        <h2 className="pg-section-title">Personal records</h2>
        {groupedPrs.length > 0 ? (
          <div className="pg-pr-groups">
            {groupedPrs.map((group) => (
              <div
                key={group.exerciseId}
                className={
                  'card pg-pr-card' + (group.hasNew ? ' pg-pr-card--new' : '')
                }
              >
                <div className="pg-pr-card-header">
                  <span className="pg-pr-exercise">{group.exercise?.name ?? 'Unknown'}</span>
                  {group.exercise?.muscle_group && (
                    <span className="pg-pr-muscle">{group.exercise.muscle_group}</span>
                  )}
                </div>
                <div className="pg-pr-rows">
                  {group.records.map((pr) => {
                    const isNew = isRecentPR(pr.achieved_at);
                    return (
                      <div key={pr.id} className="pg-pr-row">
                        <div className="pg-pr-row-left">
                          <span className="pg-pr-type-label">
                            {PR_TYPE_LABELS[pr.type] ?? pr.type}
                          </span>
                          {isNew && <span className="pg-pr-badge">NEW</span>}
                        </div>
                        <span className="pg-pr-value tabular">
                          {formatPrValue(pr, units)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span className="pg-pr-date meta">
                  {new Date(group.records[0].achieved_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TrophyIllustration />}
            message="Finish workouts to see your personal records here."
            actionLabel="Start workout"
            actionTo="/workout"
          />
        )}
      </section>

      {/* Exercise Trend */}
      <section className="pg-section">
        <h2 className="pg-section-title">Exercise trend</h2>
        {uniqueExercises.length > 0 ? (
          <div className="card pg-chart-card">
            <div className="pg-pills">
              {uniqueExercises.slice(0, 8).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={
                    'chip' +
                    (selectedExerciseId === e.id ? ' chip--active' : '')
                  }
                  onClick={() => setSelectedExerciseId(e.id)}
                >
                  {e.name}
                </button>
              ))}
            </div>
            {chartData.length > 0 ? (
              <div className="pg-chart">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 4, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--color-chart-axis)' }}
                      stroke="none"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-chart-axis)' }}
                      stroke="none"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        fontSize: '13px',
                        padding: '8px 12px',
                      }}
                      labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}
                      cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="var(--color-accent)"
                      strokeWidth={1.5}
                      fill="url(#chartGradient)"
                      dot={false}
                      activeDot={{ r: 3.5, fill: 'var(--color-accent)', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="meta pg-chart-empty">
                No data for this exercise yet.
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<ChartIllustration />}
            message="Log workouts to see exercise trends."
          />
        )}
      </section>

      {/* Frequency */}
      <section className="pg-section">
        <h2 className="pg-section-title">Frequency</h2>
        {weeklyFreq != null && weeklyFreq.length > 0 ? (
          <div className="card pg-chart-card">
            <div className="pg-freq">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={weeklyFreq}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={(v: string) =>
                      new Date(v).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                    tick={{ fontSize: 11, fill: 'var(--color-chart-axis)' }}
                    stroke="none"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--color-chart-axis)' }}
                    stroke="none"
                    tickLine={false}
                    axisLine={false}
                    width={24}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    fill="var(--color-accent)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<DumbbellIllustration />}
            message="Your weekly frequency will appear here."
          />
        )}
      </section>
    </div>
  );
}
