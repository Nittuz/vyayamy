/**
 * Personal-record formatting and grouping — no React, no DOM.
 *
 * Pure helpers for displaying, sorting, deduplicating, and grouping
 * personal records. Reusable by any client surface.
 */

import type { PersonalRecord, Exercise } from '../types/database';
import type { PRType, GroupedPR, Units } from './domain';
import { parsePRValue } from './domain';

export const PR_TYPE_LABELS: Record<PRType, string> = {
  heaviest_weight: 'Heaviest',
  best_volume: 'Best Volume',
  most_reps_at_weight: 'Best Set',
};

export const PR_TYPE_ORDER: PRType[] = [
  'heaviest_weight',
  'most_reps_at_weight',
  'best_volume',
];

export function formatPrValue(pr: PersonalRecord, units: Units): string {
  const parsed = parsePRValue(pr.type, pr.value);
  if (!parsed) return String(pr.value);

  switch (parsed.type) {
    case 'heaviest_weight':
      return `${parsed.value} ${units}`;
    case 'best_volume': {
      const v = parsed.value;
      if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k ${units}`;
      return `${v} ${units}`;
    }
    case 'most_reps_at_weight':
      return `${parsed.value.weight} ${units} x ${parsed.value.reps}`;
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function isRecentPR(achievedAt: string, windowMs = ONE_DAY_MS): boolean {
  return Date.now() - new Date(achievedAt).getTime() < windowMs;
}

export function deduplicateByType(records: PersonalRecord[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const pr of records) {
    const existing = best.get(pr.type);
    if (!existing || pr.achieved_at > existing.achieved_at) {
      best.set(pr.type, pr);
    }
  }
  return Array.from(best.values());
}

export function groupPrsByExercise(
  prs: PersonalRecord[],
  exerciseMap: Map<string, Exercise>,
  units: Units,
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
      const ai = PR_TYPE_ORDER.indexOf(a.type as PRType);
      const bi = PR_TYPE_ORDER.indexOf(b.type as PRType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const exercise = exerciseMap.get(exerciseId);
    result.push({
      exerciseId,
      exerciseName: exercise?.name ?? 'Unknown',
      muscleGroup: exercise?.muscle_group ?? null,
      records: records.map((pr) => ({
        id: pr.id,
        type: pr.type as PRType,
        displayValue: formatPrValue(pr, units),
        achievedAt: pr.achieved_at,
        isRecent: isRecentPR(pr.achieved_at),
      })),
      hasRecent: records.some((r) => isRecentPR(r.achieved_at)),
    });
  }

  result.sort((a, b) => {
    if (a.hasRecent !== b.hasRecent) return a.hasRecent ? -1 : 1;
    const aDate = a.records[0]?.achievedAt ?? '';
    const bDate = b.records[0]?.achievedAt ?? '';
    return bDate.localeCompare(aDate);
  });

  return result;
}
