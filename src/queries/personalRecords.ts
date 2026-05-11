import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { parsePRValue, type GroupedPR } from '@/core/domain';
import type { Exercise, PersonalRecord } from '@/db/types';

import { queryKeys } from './keys';

interface Row extends PersonalRecord {
  exercise_name: string | null;
  muscle_group: string | null;
}

/** Postgres ships `value` as JSONB; SQLite stores the JSON as TEXT. Decode here. */
function decodePRValue(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatDisplay(type: string, value: unknown): string {
  const decoded = decodePRValue(value);
  const parsed = parsePRValue(type, decoded as never);
  if (!parsed) return String(decoded);
  switch (parsed.type) {
    case 'heaviest_weight':
      return `${parsed.value}`;
    case 'best_volume':
      return `${parsed.value}`;
    case 'most_reps_at_weight':
      return `${parsed.value.reps} × ${parsed.value.weight}`;
  }
}

type GroupedPRItem = GroupedPR extends { records: Array<infer R> } ? R : never;

export async function getGroupedPRs(userId: string): Promise<GroupedPR[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT pr.*, ex.name AS exercise_name, ex.muscle_group AS muscle_group
       FROM personal_records pr
       LEFT JOIN exercises ex ON ex.id = pr.exercise_id
       WHERE pr.user_id = ? AND pr.deleted_at IS NULL
       ORDER BY pr.achieved_at DESC`,
    [userId],
  );

  const grouped = new Map<string, GroupedPR>();
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    let bucket = grouped.get(r.exercise_id);
    if (!bucket) {
      bucket = {
        exerciseId: r.exercise_id,
        exerciseName: r.exercise_name ?? 'Unknown',
        muscleGroup: r.muscle_group ?? null,
        records: [],
        hasRecent: false,
      };
      grouped.set(r.exercise_id, bucket);
    }
    const isRecent = new Date(r.achieved_at).getTime() > recentCutoff;
    const rec: GroupedPRItem = {
      id: r.id,
      type: r.type as GroupedPRItem['type'],
      displayValue: formatDisplay(r.type, r.value),
      achievedAt: r.achieved_at,
      isRecent,
    };
    bucket.records.push(rec);
    if (isRecent) bucket.hasRecent = true;
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.exerciseName.localeCompare(b.exerciseName),
  );
}

export function useGroupedPRs(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? queryKeys.personalRecords(userId) : ['personal_records', 'none'],
    queryFn: () => (userId ? getGroupedPRs(userId) : Promise.resolve([])),
    enabled: !!userId,
  });
}

export type WeightPoint = { achievedAt: string; weight: number };

export async function getHeaviestWeightHistory(
  userId: string,
  exerciseId: string,
): Promise<WeightPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    achieved_at: string;
    weight: number | null;
    reps: number | null;
  }>(
    `SELECT s.completed_at AS achieved_at, s.weight AS weight, s.reps AS reps
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.user_id = ? AND we.exercise_id = ?
         AND s.completed = 1 AND s.deleted_at IS NULL AND w.deleted_at IS NULL
         AND s.weight IS NOT NULL
       ORDER BY s.completed_at ASC`,
    [userId, exerciseId],
  );
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.weight == null || !r.achieved_at) continue;
    const key = r.achieved_at.slice(0, 10);
    const prev = seen.get(key) ?? 0;
    if (r.weight > prev) seen.set(key, r.weight);
  }
  return Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, weight]) => ({ achievedAt, weight }));
}
