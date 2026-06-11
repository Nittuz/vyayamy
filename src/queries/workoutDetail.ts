/**
 * Composite "workout detail" query — returns the workout, its
 * workout_exercise rows, each joined with its exercise, and the
 * nested sets. Single round-trip to SQLite via JOINs. Used by
 * WorkoutActive and HistoryDetail.
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

interface JoinedRow {
  w_id: string;
  w_user_id: string;
  w_started_at: string;
  w_ended_at: string | null;
  w_title: string;
  w_template_id: string | null;
  w_created_at: string;
  w_updated_at: string;
  w_deleted_at: string | null;
  we_id: string | null;
  we_workout_id: string | null;
  we_exercise_id: string | null;
  we_order_index: number | null;
  we_created_at: string | null;
  we_updated_at: string | null;
  we_deleted_at: string | null;
  e_id: string | null;
  e_name: string | null;
  e_muscle_group: string | null;
  e_user_id: string | null;
  e_created_at: string | null;
  e_updated_at: string | null;
  e_deleted_at: string | null;
  s_id: string | null;
  s_workout_exercise_id: string | null;
  s_order_index: number | null;
  s_weight: number | null;
  s_reps: number | null;
  s_units: 'kg' | 'lb' | null;
  s_completed: number | null;
  s_completed_at: string | null;
  s_created_at: string | null;
  s_updated_at: string | null;
  s_deleted_at: string | null;
}

const DETAIL_SQL = `
SELECT
  w.id AS w_id, w.user_id AS w_user_id, w.started_at AS w_started_at,
  w.ended_at AS w_ended_at, w.title AS w_title, w.template_id AS w_template_id,
  w.created_at AS w_created_at, w.updated_at AS w_updated_at, w.deleted_at AS w_deleted_at,
  we.id AS we_id, we.workout_id AS we_workout_id, we.exercise_id AS we_exercise_id,
  we.order_index AS we_order_index, we.created_at AS we_created_at,
  we.updated_at AS we_updated_at, we.deleted_at AS we_deleted_at,
  e.id AS e_id, e.name AS e_name, e.muscle_group AS e_muscle_group,
  e.user_id AS e_user_id, e.created_at AS e_created_at,
  e.updated_at AS e_updated_at, e.deleted_at AS e_deleted_at,
  s.id AS s_id, s.workout_exercise_id AS s_workout_exercise_id,
  s.order_index AS s_order_index, s.weight AS s_weight, s.reps AS s_reps,
  s.units AS s_units,
  s.completed AS s_completed, s.completed_at AS s_completed_at,
  s.created_at AS s_created_at, s.updated_at AS s_updated_at, s.deleted_at AS s_deleted_at
FROM workouts w
LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.deleted_at IS NULL
LEFT JOIN exercises e ON e.id = we.exercise_id
LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.deleted_at IS NULL
WHERE w.id = ? AND w.deleted_at IS NULL
ORDER BY we.order_index ASC, s.order_index ASC
`;

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const db = await getDb();
  const rows = await db.getAllAsync<JoinedRow>(DETAIL_SQL, [workoutId]);

  if (rows.length === 0) return null;

  const first = rows[0]!;
  const workout: Workout = {
    id: first.w_id,
    user_id: first.w_user_id,
    started_at: first.w_started_at,
    ended_at: first.w_ended_at,
    title: first.w_title,
    template_id: first.w_template_id,
    created_at: first.w_created_at,
    updated_at: first.w_updated_at,
    deleted_at: first.w_deleted_at,
  };

  const exerciseMap = new Map<string, WorkoutExerciseWithSets>();

  for (const row of rows) {
    if (!row.we_id) continue;

    if (!exerciseMap.has(row.we_id)) {
      const exercise: Exercise | null = row.e_id
        ? {
            id: row.e_id,
            name: row.e_name!,
            muscle_group: row.e_muscle_group,
            user_id: row.e_user_id,
            created_at: row.e_created_at!,
            updated_at: row.e_updated_at!,
            deleted_at: row.e_deleted_at,
          }
        : null;

      exerciseMap.set(row.we_id, {
        id: row.we_id,
        workout_id: row.we_workout_id!,
        exercise_id: row.we_exercise_id!,
        order_index: row.we_order_index!,
        created_at: row.we_created_at!,
        updated_at: row.we_updated_at!,
        deleted_at: row.we_deleted_at,
        exercise,
        sets: [],
      });
    }

    if (row.s_id) {
      const we = exerciseMap.get(row.we_id)!;
      if (!we.sets.some((s) => s.id === row.s_id)) {
        we.sets.push({
          id: row.s_id,
          workout_exercise_id: row.s_workout_exercise_id!,
          order_index: row.s_order_index!,
          weight: row.s_weight,
          reps: row.s_reps,
          units: row.s_units,
          completed: Boolean(row.s_completed),
          completed_at: row.s_completed_at,
          created_at: row.s_created_at!,
          updated_at: row.s_updated_at!,
          deleted_at: row.s_deleted_at,
        });
      }
    }
  }

  return { workout, exercises: Array.from(exerciseMap.values()) };
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
