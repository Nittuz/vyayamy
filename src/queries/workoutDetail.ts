/**
 * Composite "workout detail" query — returns the workout, its
 * workout_exercise rows, each joined with its exercise, and the
 * nested sets. Single round-trip to SQLite. Used by WorkoutActive
 * and HistoryDetail.
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import type { Exercise, Set as SetRow, Workout, WorkoutExercise } from '@/db/types';

import { queryKeys } from './keys';

export type WorkoutExerciseWithSets = WorkoutExercise & {
  exercise: Exercise | null;
  sets: SetRow[];
};

export type WorkoutDetail = {
  workout: Workout;
  exercises: WorkoutExerciseWithSets[];
} | null;

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const db = await getDb();
  const workout = await db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL',
    [workoutId],
  );
  if (!workout) return null;

  const wes = await db.getAllAsync<WorkoutExercise>(
    `SELECT * FROM workout_exercises
       WHERE workout_id = ? AND deleted_at IS NULL
       ORDER BY order_index ASC`,
    [workoutId],
  );

  const exercises: WorkoutExerciseWithSets[] = [];
  for (const we of wes) {
    const ex = await db.getFirstAsync<Exercise>(
      'SELECT * FROM exercises WHERE id = ?',
      [we.exercise_id],
    );
    const sets = await db.getAllAsync<SetRow>(
      `SELECT * FROM sets
         WHERE workout_exercise_id = ? AND deleted_at IS NULL
         ORDER BY order_index ASC`,
      [we.id],
    );
    exercises.push({ ...we, exercise: ex, sets });
  }

  return { workout, exercises };
}

export function useWorkoutDetail(workoutId: string | null | undefined) {
  return useQuery({
    queryKey: workoutId
      ? queryKeys.workouts.withExercises(workoutId)
      : ['workouts', 'detail', 'none'],
    queryFn: () => (workoutId ? getWorkoutDetail(workoutId) : Promise.resolve(null)),
    enabled: !!workoutId,
  });
}
