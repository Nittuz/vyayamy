/**
 * Active-workout collision detection.
 *
 * When two devices both have unfinished workouts for the same user, the post-
 * pull state has multiple rows with ended_at IS NULL. This query surfaces
 * them so the UI can present an explicit choose-which-to-resume sheet.
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type { Workout } from '@/db/types';

import { queryKeys } from './keys';

export interface ActiveWorkoutDetail {
  setCount: number;
  exerciseCount: number;
}

export interface ActiveWorkoutCollisions {
  workouts: Workout[];
  details: Map<string, ActiveWorkoutDetail>;
}

export async function getActiveWorkoutCollisions(
  userId: string,
): Promise<ActiveWorkoutCollisions> {
  const db = await getDb();
  const workouts = await db.getAllAsync<Workout>(
    `SELECT * FROM workouts
       WHERE user_id = ?
         AND ended_at IS NULL
         AND deleted_at IS NULL
       ORDER BY started_at DESC`,
    [userId],
  );
  if (workouts.length < 2) return { workouts, details: new Map() };

  const details = new Map<string, ActiveWorkoutDetail>();
  for (const w of workouts) {
    const r = await db.getFirstAsync<{ set_count: number; exercise_count: number }>(
      `SELECT
         COUNT(DISTINCT s.id) AS set_count,
         COUNT(DISTINCT we.id) AS exercise_count
       FROM workout_exercises we
       LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.deleted_at IS NULL
       WHERE we.workout_id = ? AND we.deleted_at IS NULL`,
      [w.id],
    );
    details.set(w.id, {
      setCount: r?.set_count ?? 0,
      exerciseCount: r?.exercise_count ?? 0,
    });
  }
  return { workouts, details };
}

export function useActiveWorkoutCollisions(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.workouts.all, 'collisions', userId]
      : ['workouts', 'collisions', 'none'],
    queryFn: () =>
      userId
        ? getActiveWorkoutCollisions(userId)
        : Promise.resolve({ workouts: [], details: new Map() } as ActiveWorkoutCollisions),
    enabled: !!userId,
  });
}
