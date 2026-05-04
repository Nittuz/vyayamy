import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type { Workout } from '@/db/types';

import { queryKeys } from './keys';

export interface HistoryRow extends Workout {
  exercise_count: number;
  set_count: number;
  completed_set_count: number;
  volume: number;
}

export async function getHistory(userId: string, limit = 50): Promise<HistoryRow[]> {
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
     LIMIT ?`,
    [userId, limit],
  );
}

export function useHistory(userId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: userId ? queryKeys.history(userId) : ['history', 'none'],
    queryFn: () => (userId ? getHistory(userId, limit) : Promise.resolve([])),
    enabled: !!userId,
  });
}
