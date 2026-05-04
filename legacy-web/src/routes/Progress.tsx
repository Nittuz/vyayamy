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
  ReferenceLine,
} from 'recharts';
import { useAuth } from '../lib/useAuth';
import {
  CHART_TICK,
  CHART_MARGIN,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL,
  CHART_CURSOR,
  CHART_ACTIVE_DOT,
  CHART_REFERENCE_LINE,
} from '../lib/chartConfig';
import {
  usePersonalRecords,
  useWeeklyFrequency,
  useExerciseSessionHistory,
  useMultiExerciseTrends,
} from '../lib/queries/records';
import { useProfile } from '../lib/queries/profile';
import {
  useRecentExerciseIds,
  useExercisesByIds,
} from '../lib/queries/exercises';
import {
  useActivePlan,
  useWeekCompletions,
  getMissedWeeklySlots,
  dayOfWeekName,
} from '../lib/queries/plans';
import { useTemplates } from '../lib/queries/templates';
import {
  computeWeeklySummary,
  computeExerciseExposure,
  classifyTrend,
  findTopImproving,
  findStalledExercise,
  frequencySummaryText,
  suggestNextTarget,
} from '../lib/progressInsights';
import type { TrendDirection } from '../lib/progressInsights';
import { PR_TYPE_LABELS, groupPrsByExercise } from '../lib/prFormatting';
import { EmptyState, TrophyIllustration, ChartIllustration, DumbbellIllustration } from '../components/EmptyState';
import './Progress.css';

function trendLabel(direction: TrendDirection): string {
  switch (direction) {
    case 'improving': return 'Trending up';
    case 'flat': return 'Flat';
    case 'declining': return 'Trending down';
    case 'insufficient_data': return '';
  }
}

function trendClassName(direction: TrendDirection): string {
  switch (direction) {
    case 'improving': return 'pg-trend--up';
    case 'declining': return 'pg-trend--down';
    case 'flat': return 'pg-trend--flat';
    default: return '';
  }
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function Progress() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const units = profile?.units ?? 'kg';
  const { data: prs } = usePersonalRecords(user?.id);
  const { data: weeklyFreq } = useWeeklyFrequency(user?.id, 8);

  // Exercise list for trend analysis + chart selection
  const recentIds = useRecentExerciseIds(user?.id, 10);
  const recentExercises = useExercisesByIds(recentIds.data ?? []);
  const uniqueExercises = recentExercises.data ?? [];
  const byId = new Map(uniqueExercises.map((e) => [e.id, e]));

  // Multi-exercise trend analysis
  const { data: exerciseTrends } = useMultiExerciseTrends(user?.id, uniqueExercises);

  // Selected exercise for detail chart
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const activeExerciseId = selectedExerciseId ?? uniqueExercises[0]?.id ?? null;
  const { data: sessionHistory } = useExerciseSessionHistory(
    user?.id,
    activeExerciseId ?? undefined,
  );

  // Plan adherence
  const { data: activePlan } = useActivePlan(user?.id);
  const { data: weekCompletions } = useWeekCompletions(user?.id);
  const { data: templates } = useTemplates(user?.id);
  const templateMap = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const missedSlots = useMemo(() => {
    if (!activePlan || !weekCompletions) return [];
    return getMissedWeeklySlots(activePlan, weekCompletions);
  }, [activePlan, weekCompletions]);

  const plannedSessionsThisWeek = useMemo(() => {
    if (!activePlan || activePlan.plan_type !== 'weekly') return null;
    return activePlan.slots.filter((s) => !s.is_rest_day && s.template_id).length;
  }, [activePlan]);

  // Grouped PRs
  const groupedPrs = useMemo(
    () => groupPrsByExercise(prs ?? [], byId, units),
    [prs, byId, units],
  );

  // Weekly summary
  const exerciseNameMap = new Map(uniqueExercises.map((e) => [e.id, e.name]));
  const weeklySummary = useMemo(
    () => computeWeeklySummary(weeklyFreq, prs, exerciseNameMap),
    [weeklyFreq, prs, exerciseNameMap],
  );

  // Insight highlights
  const topImproving = useMemo(
    () => findTopImproving(exerciseTrends ?? []),
    [exerciseTrends],
  );
  const stalledExercise = useMemo(
    () => findStalledExercise(exerciseTrends ?? []),
    [exerciseTrends],
  );

  // Selected exercise details
  const selectedSessions = sessionHistory ?? [];
  const selectedTrend = useMemo(
    () => classifyTrend(selectedSessions),
    [selectedSessions],
  );
  const selectedExposure = useMemo(
    () => computeExerciseExposure(selectedSessions),
    [selectedSessions],
  );
  const nextTarget = useMemo(
    () => suggestNextTarget(selectedSessions, selectedTrend.direction, units),
    [selectedSessions, selectedTrend.direction, units],
  );

  // Chart data from session history
  const chartData = selectedSessions.map((s) => ({
    date: formatShortDate(s.date),
    weight: s.bestWeight || null,
    e1rm: s.bestE1Rm,
    volume: s.totalVolume,
  }));

  const [chartMetric, setChartMetric] = useState<'weight' | 'e1rm'>('weight');
  const activeDataKey = chartMetric === 'e1rm' ? 'e1rm' : 'weight';

  // Frequency summary
  const freqSummary = frequencySummaryText(weeklyFreq);

  // Average frequency for reference line
  const avgFreq = useMemo(() => {
    if (!weeklyFreq || weeklyFreq.length === 0) return 0;
    const total = weeklyFreq.reduce((sum, w) => sum + w.count, 0);
    return Math.round((total / weeklyFreq.length) * 10) / 10;
  }, [weeklyFreq]);

  const hasAnyData = (prs && prs.length > 0) ||
    uniqueExercises.length > 0 ||
    (weeklyFreq && weeklyFreq.some((w) => w.count > 0));

  return (
    <div className="progress">
      <h1 className="page-title">Progress</h1>

      {/* ── Training Summary ── */}
      {hasAnyData && (
        <section className="pg-summary">
          {topImproving && (
            <div className="card pg-summary-card">
              <span className="pg-summary-label">Strongest trend</span>
              <span className="pg-summary-value">{topImproving.exerciseName}</span>
              <span className="pg-summary-detail pg-trend--up">
                {topImproving.trend.reason}
              </span>
            </div>
          )}

          {stalledExercise && (
            <div className="card pg-summary-card">
              <span className="pg-summary-label">Needs attention</span>
              <span className="pg-summary-value">{stalledExercise.exerciseName}</span>
              <span className="pg-summary-detail pg-trend--flat">
                {stalledExercise.trend.reason}
              </span>
            </div>
          )}

          {weeklySummary.sessionsThisWeek > 0 && (
            <div className="card pg-summary-card">
              <span className="pg-summary-label">This week</span>
              <span className="pg-summary-value tabular">
                {weeklySummary.sessionsThisWeek} session{weeklySummary.sessionsThisWeek !== 1 ? 's' : ''}
              </span>
              {weeklySummary.frequencyChange !== 'no_history' && weeklySummary.sessionsLastWeek > 0 && (
                <span className="pg-summary-detail meta">
                  {weeklySummary.frequencyChange === 'up' && 'Up from '}
                  {weeklySummary.frequencyChange === 'down' && 'Down from '}
                  {weeklySummary.frequencyChange === 'same' && 'Same as '}
                  {weeklySummary.sessionsLastWeek} last week
                </span>
              )}
            </div>
          )}

          {weeklySummary.mostRecentPr && (
            <div className="card pg-summary-card pg-summary-card--pr">
              <span className="pg-summary-label">Latest PR</span>
              <span className="pg-summary-value">{weeklySummary.mostRecentPr.exerciseName}</span>
              <span className="pg-summary-detail meta">
                {PR_TYPE_LABELS[weeklySummary.mostRecentPr.type] ?? weeklySummary.mostRecentPr.type}
                {' \u00B7 '}
                {formatShortDate(weeklySummary.mostRecentPr.achievedAt)}
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── This Week ── */}
      {(activePlan || (weeklyFreq && weeklyFreq.length > 0)) ? (
        <section className="pg-section">
          <h2 className="pg-section-title">This week</h2>
          <div className="card pg-week-card">
            {/* Plan adherence */}
            {activePlan && plannedSessionsThisWeek != null && (
              <div className="pg-week-row">
                <span className="pg-week-row-label">Plan adherence</span>
                <span className="pg-week-row-value tabular">
                  {weekCompletions?.length ?? 0} of {plannedSessionsThisWeek} sessions
                </span>
              </div>
            )}

            {/* Sessions this week (when no plan) */}
            {!activePlan && weeklySummary.sessionsThisWeek > 0 && (
              <div className="pg-week-row">
                <span className="pg-week-row-label">Sessions</span>
                <span className="pg-week-row-value tabular">
                  {weeklySummary.sessionsThisWeek}
                </span>
              </div>
            )}

            {/* Missed slots */}
            {missedSlots.length > 0 && (
              <div className="pg-week-row pg-week-row--missed">
                <span className="pg-week-row-label">Missed</span>
                <span className="pg-week-row-value">
                  {missedSlots.map((m) => {
                    const name = m.slot.template_id
                      ? templateMap.get(m.slot.template_id) ?? m.slot.label
                      : m.slot.label;
                    return name
                      ? `${name} (${dayOfWeekName(m.dayOfWeek, true)})`
                      : dayOfWeekName(m.dayOfWeek, true);
                  }).join(', ')}
                </span>
              </div>
            )}

            {/* Top improving win */}
            {topImproving && (
              <div className="pg-week-row">
                <span className="pg-week-row-label">Top progress</span>
                <span className="pg-week-row-value pg-trend--up">
                  {topImproving.exerciseName}
                </span>
              </div>
            )}

            {/* Neglected exercise */}
            {exerciseTrends && exerciseTrends.length > 0 && (() => {
              const neglected = exerciseTrends
                .filter((e) => e.lastSessionDate != null && e.sessionCount >= 2)
                .sort((a, b) => (a.lastSessionDate ?? '').localeCompare(b.lastSessionDate ?? ''));
              const oldest = neglected[0];
              if (!oldest?.lastSessionDate) return null;
              const daysSince = Math.floor(
                (Date.now() - new Date(oldest.lastSessionDate).getTime()) / (24 * 60 * 60 * 1000),
              );
              if (daysSince < 10) return null;
              return (
                <div className="pg-week-row">
                  <span className="pg-week-row-label">Not trained recently</span>
                  <span className="pg-week-row-value meta">
                    {oldest.exerciseName} ({daysSince} days)
                  </span>
                </div>
              );
            })()}
          </div>
        </section>
      ) : (
        <section className="pg-section">
          <h2 className="pg-section-title">This week</h2>
          <div className="card pg-week-card pg-week-card--empty">
            <p className="meta">Complete a workout to see your weekly activity here.</p>
          </div>
        </section>
      )}

      {/* ── Exercise Trend ── */}
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
                    (activeExerciseId === e.id ? ' chip--active' : '')
                  }
                  onClick={() => setSelectedExerciseId(e.id)}
                >
                  {e.name}
                </button>
              ))}
            </div>

            {/* Exercise meta */}
            {selectedSessions.length > 0 && (
              <div className="pg-exercise-meta">
                {selectedTrend.direction !== 'insufficient_data' && (
                  <span className={`pg-trend-label ${trendClassName(selectedTrend.direction)}`}>
                    {trendLabel(selectedTrend.direction)}
                  </span>
                )}
                <div className="pg-exercise-stats">
                  {selectedSessions.length > 0 && (() => {
                    const last = selectedSessions[selectedSessions.length - 1];
                    return (
                      <span className="pg-exercise-stat">
                        Last: {last.bestWeight} {units} x {last.bestReps}
                        <span className="meta"> · {formatShortDate(last.date)}</span>
                      </span>
                    );
                  })()}
                  {selectedExposure.last28Days > 0 && (
                    <span className="pg-exercise-stat meta">
                      {selectedExposure.last28Days} session{selectedExposure.last28Days !== 1 ? 's' : ''} in 4 weeks
                    </span>
                  )}
                  {nextTarget && (
                    <span className="pg-exercise-stat pg-next-target">
                      {nextTarget}
                    </span>
                  )}
                </div>
                {selectedTrend.direction !== 'insufficient_data' && (
                  <p className="pg-trend-reason meta">
                    {selectedTrend.reason}
                  </p>
                )}
              </div>
            )}

            {/* Metric toggle */}
            {chartData.length > 0 && chartData.some((d) => d.e1rm != null) && (
              <div className="pg-metric-toggle">
                <button
                  type="button"
                  className={'chip chip--sm' + (chartMetric === 'weight' ? ' chip--active' : '')}
                  onClick={() => setChartMetric('weight')}
                >
                  Weight
                </button>
                <button
                  type="button"
                  className={'chip chip--sm' + (chartMetric === 'e1rm' ? ' chip--active' : '')}
                  onClick={() => setChartMetric('e1rm')}
                >
                  Est. 1RM
                </button>
              </div>
            )}

            {chartData.length > 0 ? (
              <div className="pg-chart">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={CHART_MARGIN}>
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={CHART_TICK}
                      stroke="none"
                      tickLine={false}
                    />
                    <YAxis
                      tick={CHART_TICK}
                      stroke="none"
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL}
                      cursor={CHART_CURSOR}
                      formatter={(value: number) => [
                        `${value} ${chartMetric === 'e1rm' ? units : units}`,
                        chartMetric === 'e1rm' ? 'Est. 1RM' : 'Best set',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey={activeDataKey}
                      stroke="var(--color-accent)"
                      strokeWidth={1.5}
                      fill="url(#chartGradient)"
                      dot={false}
                      activeDot={CHART_ACTIVE_DOT}
                      connectNulls
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
            message="Exercise trends will appear after your first workout."
            actionLabel="Start workout"
            actionTo="/"
          />
        )}
      </section>

      {/* ── Personal Records ── */}
      <section className="pg-section">
        <h2 className="pg-section-title">Personal records</h2>
        {groupedPrs.length > 0 ? (
          <div className="pg-pr-groups">
            {groupedPrs.map((group) => (
              <div
                key={group.exerciseId}
                className={
                  'card pg-pr-card' + (group.hasRecent ? ' pg-pr-card--new' : '')
                }
              >
                <div className="pg-pr-card-header">
                  <span className="pg-pr-exercise">{group.exerciseName}</span>
                  {group.muscleGroup && (
                    <span className="pg-pr-muscle">{group.muscleGroup}</span>
                  )}
                </div>
                <div className="pg-pr-rows">
                  {group.records.map((rec) => (
                    <div key={rec.id} className="pg-pr-row">
                      <div className="pg-pr-row-left">
                        <span className="pg-pr-type-label">
                          {PR_TYPE_LABELS[rec.type] ?? rec.type}
                        </span>
                        {rec.isRecent && <span className="tag tag--pr">NEW</span>}
                      </div>
                      <span className="pg-pr-value tabular">
                        {rec.displayValue}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="pg-pr-date meta">
                  {formatShortDate(group.records[0].achievedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TrophyIllustration />}
            message="Personal records will appear after your first workout."
            actionLabel="Start workout"
            actionTo="/"
          />
        )}
      </section>

      {/* ── Frequency ── */}
      <section className="pg-section">
        <h2 className="pg-section-title">Frequency</h2>
        {weeklyFreq != null && weeklyFreq.length > 0 ? (
          <div className="card pg-chart-card">
            {freqSummary && (
              <p className="pg-freq-summary">{freqSummary}</p>
            )}
            <div className="pg-freq">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={weeklyFreq}
                  margin={{ ...CHART_MARGIN, top: 4 }}
                >
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={(v: string) =>
                      new Date(v).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                    tick={CHART_TICK}
                    stroke="none"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={CHART_TICK}
                    stroke="none"
                    tickLine={false}
                    axisLine={false}
                    width={24}
                  />
                  {avgFreq > 0 && (
                    <ReferenceLine
                      y={avgFreq}
                      stroke={CHART_REFERENCE_LINE.stroke}
                      strokeDasharray={CHART_REFERENCE_LINE.strokeDasharray}
                      strokeWidth={CHART_REFERENCE_LINE.strokeWidth}
                    />
                  )}
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL}
                    cursor={CHART_CURSOR}
                    formatter={(value: number) => [
                      `${value} session${value !== 1 ? 's' : ''}`,
                      'Workouts',
                    ]}
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
            message="Weekly frequency will appear after your first workout."
            actionLabel="Start workout"
            actionTo="/"
          />
        )}
      </section>
    </div>
  );
}
