/**
 * Pure functions for deriving progress insights from workout data.
 *
 * Trend rules are intentionally simple and explainable:
 * - "Improving": best-set e1RM average of last 3 sessions > prior 3 by >= 1%
 * - "Flat": difference within +/- 1% across 5+ sessions
 * - "Declining": best-set e1RM average trending down by > 2%
 * - "Insufficient data": fewer than 4 sessions
 */

import type { ExerciseHistoryPoint } from './queries/records';
import type { PersonalRecord } from '../types/database';

// ── Shared Formulas ──

/** Epley-based estimated one-rep max. Returns null for invalid inputs or reps > 12. */
export function estimatedE1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0 || reps > 12) return null;
  return Math.round(weight * (1 + reps / 30));
}

// ── Session Aggregation ──

export type SessionPoint = {
  date: string;
  bestWeight: number;
  bestReps: number;
  bestVolume: number;
  bestE1Rm: number | null;
  totalVolume: number;
  setCount: number;
};

export function aggregateBySession(points: ExerciseHistoryPoint[]): SessionPoint[] {
  const byDate = new Map<string, ExerciseHistoryPoint[]>();
  for (const p of points) {
    const key = p.date.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(p);
  }

  const sessions: SessionPoint[] = [];
  for (const [, sets] of byDate) {
    let bestWeight = 0;
    let bestReps = 0;
    let bestVolume = 0;
    let bestE1Rm: number | null = null;
    let totalVolume = 0;

    for (const s of sets) {
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      const vol = w * r;
      totalVolume += vol;
      if (vol > bestVolume) {
        bestVolume = vol;
        bestWeight = w;
        bestReps = r;
      }
      if (s.estimated1Rm != null && (bestE1Rm == null || s.estimated1Rm > bestE1Rm)) {
        bestE1Rm = s.estimated1Rm;
      }
    }

    sessions.push({
      date: sets[0].date,
      bestWeight,
      bestReps,
      bestVolume,
      bestE1Rm,
      totalVolume,
      setCount: sets.length,
    });
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

// ── Trend Classification ──

export type TrendDirection = 'improving' | 'flat' | 'declining' | 'insufficient_data';

export type TrendResult = {
  direction: TrendDirection;
  reason: string;
  sessionCount: number;
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Classify the trend for a single exercise based on session history.
 * Uses best-set e1RM when available, falls back to best-set volume.
 */
export function classifyTrend(sessions: SessionPoint[]): TrendResult {
  if (sessions.length < 4) {
    return {
      direction: 'insufficient_data',
      reason: sessions.length === 0
        ? 'No sessions logged.'
        : `Only ${sessions.length} session${sessions.length === 1 ? '' : 's'} logged.`,
      sessionCount: sessions.length,
    };
  }

  const hasE1Rm = sessions.some((s) => s.bestE1Rm != null);
  const metric = (s: SessionPoint) =>
    hasE1Rm && s.bestE1Rm != null ? s.bestE1Rm : s.bestVolume;

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const splitAt = Math.max(sorted.length - 3, Math.floor(sorted.length / 2));
  const older = sorted.slice(0, splitAt).map(metric);
  const recent = sorted.slice(splitAt).map(metric);

  const olderAvg = avg(older);
  const recentAvg = avg(recent);

  if (olderAvg === 0) {
    return {
      direction: 'insufficient_data',
      reason: 'Not enough weighted data to determine trend.',
      sessionCount: sessions.length,
    };
  }

  const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (changePct >= 1) {
    return {
      direction: 'improving',
      reason: `Up ${Math.round(changePct)}% across your last ${sessions.length} sessions.`,
      sessionCount: sessions.length,
    };
  }
  if (changePct <= -2) {
    return {
      direction: 'declining',
      reason: `Down ${Math.abs(Math.round(changePct))}% across your last ${sessions.length} sessions.`,
      sessionCount: sessions.length,
    };
  }
  return {
    direction: 'flat',
    reason: `No meaningful change across ${sessions.length} sessions.`,
    sessionCount: sessions.length,
  };
}

// ── Exercise Summaries (multi-exercise) ──

export type ExerciseTrendSummary = {
  exerciseId: string;
  exerciseName: string;
  trend: TrendResult;
  lastSessionDate: string | null;
  sessionCount: number;
  lastBestWeight: number;
  lastBestReps: number;
};

export function buildExerciseSummary(
  exerciseId: string,
  exerciseName: string,
  sessions: SessionPoint[],
): ExerciseTrendSummary {
  const trend = classifyTrend(sessions);
  const last = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return {
    exerciseId,
    exerciseName,
    trend,
    lastSessionDate: last?.date ?? null,
    sessionCount: sessions.length,
    lastBestWeight: last?.bestWeight ?? 0,
    lastBestReps: last?.bestReps ?? 0,
  };
}

export function findTopImproving(
  summaries: ExerciseTrendSummary[],
): ExerciseTrendSummary | null {
  const improving = summaries.filter((s) => s.trend.direction === 'improving');
  if (improving.length === 0) return null;
  improving.sort((a, b) => {
    const aPct = parseChangePercent(a.trend.reason);
    const bPct = parseChangePercent(b.trend.reason);
    return bPct - aPct;
  });
  return improving[0];
}

export function findStalledExercise(
  summaries: ExerciseTrendSummary[],
): ExerciseTrendSummary | null {
  const stalled = summaries.filter(
    (s) => s.trend.direction === 'flat' || s.trend.direction === 'declining',
  );
  if (stalled.length === 0) return null;
  stalled.sort((a, b) => b.sessionCount - a.sessionCount);
  return stalled[0];
}

function parseChangePercent(reason: string): number {
  const match = reason.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Exercise Exposure ──

export type ExposureInfo = {
  last14Days: number;
  last28Days: number;
  daysSinceLast: number | null;
};

export function computeExerciseExposure(sessions: SessionPoint[]): ExposureInfo {
  const now = Date.now();
  const d14 = now - 14 * 24 * 60 * 60 * 1000;
  const d28 = now - 28 * 24 * 60 * 60 * 1000;

  let last14 = 0;
  let last28 = 0;
  let latestTs: number | null = null;

  for (const s of sessions) {
    const ts = new Date(s.date).getTime();
    if (ts >= d14) last14++;
    if (ts >= d28) last28++;
    if (latestTs == null || ts > latestTs) latestTs = ts;
  }

  return {
    last14Days: last14,
    last28Days: last28,
    daysSinceLast: latestTs != null ? Math.floor((now - latestTs) / (24 * 60 * 60 * 1000)) : null,
  };
}

// ── Weekly Summary ──

export type WeeklySummary = {
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  frequencyChange: 'up' | 'down' | 'same' | 'no_history';
  frequencyNote: string;
  mostRecentPr: { exerciseName: string; type: string; achievedAt: string } | null;
};

export function computeWeeklySummary(
  weeklyFreq: { weekStart: string; count: number }[] | undefined,
  prs: PersonalRecord[] | undefined,
  exerciseMap: Map<string, string>,
): WeeklySummary {
  const weeks = weeklyFreq ?? [];
  const thisWeek = weeks.length > 0 ? weeks[weeks.length - 1].count : 0;
  const lastWeek = weeks.length > 1 ? weeks[weeks.length - 2].count : 0;

  let frequencyChange: WeeklySummary['frequencyChange'] = 'no_history';
  let frequencyNote = '';

  if (weeks.length >= 2) {
    if (thisWeek > lastWeek) {
      frequencyChange = 'up';
      frequencyNote = `You trained ${thisWeek} time${thisWeek !== 1 ? 's' : ''} this week, up from ${lastWeek} last week.`;
    } else if (thisWeek < lastWeek) {
      frequencyChange = 'down';
      frequencyNote = `You trained ${thisWeek} time${thisWeek !== 1 ? 's' : ''} this week, down from ${lastWeek} last week.`;
    } else {
      frequencyChange = 'same';
      frequencyNote = `You trained ${thisWeek} time${thisWeek !== 1 ? 's' : ''} this week, same as last week.`;
    }
  } else if (weeks.length === 1) {
    frequencyNote = `You trained ${thisWeek} time${thisWeek !== 1 ? 's' : ''} this week.`;
    frequencyChange = 'same';
  }

  let mostRecentPr: WeeklySummary['mostRecentPr'] = null;
  if (prs && prs.length > 0) {
    const sorted = [...prs].sort(
      (a, b) => b.achieved_at.localeCompare(a.achieved_at),
    );
    const top = sorted[0];
    mostRecentPr = {
      exerciseName: exerciseMap.get(top.exercise_id) ?? 'Unknown',
      type: top.type,
      achievedAt: top.achieved_at,
    };
  }

  return {
    sessionsThisWeek: thisWeek,
    sessionsLastWeek: lastWeek,
    frequencyChange,
    frequencyNote,
    mostRecentPr,
  };
}

// ── Frequency Summary Text ──

export function frequencySummaryText(
  weeklyFreq: { weekStart: string; count: number }[] | undefined,
): string {
  const weeks = weeklyFreq ?? [];
  if (weeks.length === 0) return '';
  const thisWeek = weeks[weeks.length - 1].count;
  const lastWeek = weeks.length > 1 ? weeks[weeks.length - 2].count : null;

  if (lastWeek == null) {
    return `${thisWeek} session${thisWeek !== 1 ? 's' : ''} this week.`;
  }
  if (thisWeek === lastWeek) {
    return `${thisWeek} session${thisWeek !== 1 ? 's' : ''} this week, same as last week.`;
  }
  if (thisWeek > lastWeek) {
    return `${thisWeek} session${thisWeek !== 1 ? 's' : ''} this week, up from ${lastWeek}.`;
  }
  return `${thisWeek} session${thisWeek !== 1 ? 's' : ''} this week, down from ${lastWeek}.`;
}

// ── Next Target Suggestion ──

export function suggestNextTarget(
  sessions: SessionPoint[],
  trend: TrendDirection,
  units: string,
): string | null {
  if (sessions.length < 3 || trend === 'insufficient_data') return null;
  if (trend === 'declining') return null;

  const last = sessions[sessions.length - 1];
  if (last.bestWeight <= 0) return null;

  const step = units === 'lb' ? 5 : 2.5;
  const nextWeight = last.bestWeight + step;
  return `Next target: ${nextWeight} ${units} x ${last.bestReps}`;
}

// TODO Phase 4: persist computed trends so they survive across sessions without recomputation
