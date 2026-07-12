import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type { Workout } from '@/db/types';

import { queryKeys } from './keys';

export interface HistoryRow extends Workout {
  exercise_count: number;
  set_count: number;
  completed_set_count: number;
  volume: number;
}

const PAGE_SIZE = 30;

/**
 * #155 (backlog 1.8): `started_at` is the canonical day a workout belongs to.
 * An 11pm session belongs to the day you walked in, even if it ended after
 * midnight. Every surface that groups, ages, or buckets workouts by day must
 * anchor on this helper (History grouping does; the query below orders by the
 * same instant). Do not date-attribute from `ended_at`.
 */
export function workoutDayAnchor(workout: Pick<Workout, 'started_at'>): string {
  return workout.started_at;
}

export async function getHistory(userId: string, limit = 50, offset = 0): Promise<HistoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<HistoryRow>(
    `SELECT
        w.*,
        (SELECT COUNT(*) FROM workout_exercises we
            WHERE we.workout_id = w.id AND we.deleted_at IS NULL) AS exercise_count,
        (SELECT COUNT(*) FROM sets s
            JOIN workout_exercises we ON we.id = s.workout_exercise_id
            WHERE we.workout_id = w.id AND s.deleted_at IS NULL AND we.deleted_at IS NULL) AS set_count,
        (SELECT COUNT(*) FROM sets s
            JOIN workout_exercises we ON we.id = s.workout_exercise_id
            WHERE we.workout_id = w.id AND s.completed = 1 AND s.deleted_at IS NULL AND we.deleted_at IS NULL) AS completed_set_count,
        COALESCE((SELECT SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) FROM sets s
            JOIN workout_exercises we ON we.id = s.workout_exercise_id
            WHERE we.workout_id = w.id AND s.completed = 1 AND s.deleted_at IS NULL AND we.deleted_at IS NULL), 0) AS volume
     FROM workouts w
     WHERE w.user_id = ? AND w.ended_at IS NOT NULL AND w.deleted_at IS NULL
     ORDER BY w.started_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
}

/** Backwards-compatible single-page query for callers that only need the head. */
export function useHistory(userId: string | undefined, limit = PAGE_SIZE) {
  return useQuery({
    queryKey: userId ? queryKeys.history(userId) : ['history', 'none'],
    queryFn: () => (userId ? getHistory(userId, limit) : Promise.resolve([])),
    enabled: !!userId,
  });
}

/** Paginated history. The History screen scrolls through workout pages of
 *  PAGE_SIZE so users with hundreds of sessions don't silently lose them. */
export function useHistoryInfinite(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? [...queryKeys.history(userId), 'infinite'] : ['history', 'none', 'infinite'],
    queryFn: ({ pageParam }) =>
      userId ? getHistory(userId, PAGE_SIZE, pageParam as number) : Promise.resolve([]),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!userId,
  });
}
