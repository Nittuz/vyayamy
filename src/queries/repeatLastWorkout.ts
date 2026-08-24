/**
 * Repeat-last-workout — reads the user's most recent finished workout
 * and produces (a) a summary for the Today Repeat card, and (b) a
 * mutation that clones the workout's exercises with one pre-seeded set
 * per exercise (weight + reps from the most recent COMPLETED set), the
 * weight converted to the CURRENT profile unit and rounded to its step at
 * creation time (task-1: the seeded stepper must never lie about its unit —
 * same convention planFirstSet uses for in-session prefill).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { convertAndRoundWeight, type AutoStagedSet } from '@/components/activeSet';
import { getDb } from '@/db/client';
import { insertRowInTx } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import { nowIso, uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';

import { queryKeys } from './keys';

/**
 * Lazy import (db/client.ts precedent): errorReporting pulls in
 * expo-constants, which must not sit on the jest/node import path.
 */
function reportError(err: unknown, context: Record<string, unknown>): void {
  void import('@/lib/errorReporting').then(({ captureException }) =>
    captureException(err, context),
  );
}

export interface ExerciseSeed {
  exerciseId: string;
  exerciseName: string;
  seedWeight: number | null;
  seedReps: number | null;
  seedUnits: 'kg' | 'lb' | null;
}

export interface LastWorkoutWithSeeds {
  workout: {
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  };
  seeds: ExerciseSeed[];
}

export async function getLastFinishedWorkoutWithSeeds(
  userId: string,
): Promise<LastWorkoutWithSeeds | null> {
  const db = await getDb();
  const workout = await db.getFirstAsync<{
    id: string;
    title: string;
    started_at: string;
    ended_at: string;
  }>(
    `SELECT id, title, started_at, ended_at FROM workouts
       WHERE user_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY ended_at DESC LIMIT 1`,
    [userId],
  );
  if (!workout) return null;

  const exerciseRows = await db.getAllAsync<{
    we_id: string;
    exercise_id: string;
    exercise_name: string;
    order_index: number;
  }>(
    `SELECT we.id AS we_id, we.exercise_id, e.name AS exercise_name, we.order_index
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
      WHERE we.workout_id = ? AND we.deleted_at IS NULL
      ORDER BY we.order_index`,
    [workout.id],
  );

  const seeds: ExerciseSeed[] = [];
  for (const row of exerciseRows) {
    const lastSet = await db.getFirstAsync<{
      weight: number | null;
      reps: number | null;
      units: 'kg' | 'lb' | null;
    }>(
      `SELECT weight, reps, units FROM sets
         WHERE workout_exercise_id = ? AND completed = 1 AND deleted_at IS NULL
         ORDER BY order_index DESC LIMIT 1`,
      [row.we_id],
    );
    seeds.push({
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      seedWeight: lastSet?.weight ?? null,
      seedReps: lastSet?.reps ?? null,
      // Raw historical unit — RepeatCard's preview reads it as-is (formatSeed),
      // and repeatLastWorkout uses it as the FROM unit when converting into
      // the current profile unit at creation time (task-1); the row it
      // inserts carries the converted unit, not this one.
      seedUnits: lastSet?.units ?? null,
    });
  }

  return { workout, seeds };
}

export function useLastFinishedWorkoutWithSeeds(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.workouts.all, 'last-finished', userId]
      : ['workouts', 'last-finished', 'none'],
    queryFn: () => (userId ? getLastFinishedWorkoutWithSeeds(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });
}

/** repeatLastWorkout's outcome: the new workout id, plus one provenance
 * descriptor per seeded set that actually carries a value — the screen
 * stashes these (pendingSeedMarkers) so the active-workout mount can adopt
 * them into its stagedMarkers map (honest confirms + LAST TIME, spec §2/§3). */
export interface RepeatWorkoutResult {
  workoutId: string;
  markers: AutoStagedSet[];
}

export async function repeatLastWorkout(
  userId: string,
  units: 'kg' | 'lb',
  weightStep: number,
): Promise<RepeatWorkoutResult | null> {
  const source = await getLastFinishedWorkoutWithSeeds(userId);
  if (!source) return null;

  const db = await getDb();
  const newWorkoutId = uuidv4();
  const now = nowIso();
  const markers: AutoStagedSet[] = [];

  // Clone the whole workout (workout + exercises + seeded sets + their outbox
  // rows) in ONE transaction, so a crash mid-clone can't leave a half-built —
  // possibly empty — active workout behind (#20).
  await withTransaction(db, async () => {
    await insertRowInTx(
      db,
      'workouts',
      newWorkoutId,
      {
        user_id: userId,
        started_at: now,
        title: source.workout.title,
        template_id: null,
        ended_at: null,
      },
      now,
    );

    for (const [i, seed] of source.seeds.entries()) {
      const weId = uuidv4();
      await insertRowInTx(
        db,
        'workout_exercises',
        weId,
        {
          workout_id: newWorkoutId,
          exercise_id: seed.exerciseId,
          order_index: i,
        },
        now,
      );

      // Convert the historical seed into the CURRENT profile unit, rounded to
      // its step — the same convert+round convention planFirstSet uses for
      // in-session prefill (task-1: the seeded stepper must never lie about
      // its unit). weight stays null for a BW/never-done seed; units follows
      // weight (null iff weight is null), matching planFirstSet's contract.
      const weight = convertAndRoundWeight(seed.seedWeight, seed.seedUnits, units, weightStep);
      const seedUnits = weight != null ? units : null;

      const setId = uuidv4();
      await insertRowInTx(
        db,
        'sets',
        setId,
        {
          workout_exercise_id: weId,
          order_index: 0,
          weight,
          reps: seed.seedReps,
          units: seedUnits,
          completed: 0,
          completed_at: null,
        },
        now,
      );

      // Only a set actually seeded with a value carries provenance — an
      // empty seed (never-done exercise) needs no marker: it can't trip the
      // leave-confirm gate (shouldConfirmLeavingSet bails on all-null sets)
      // and has no LAST TIME to show. Marker carries the CONVERTED weight —
      // it must match the row just inserted (spec §3).
      if (weight != null || seed.seedReps != null) {
        markers.push({
          id: setId,
          weight,
          reps: seed.seedReps,
          source: 'history',
        });
      }
    }
  });

  emitMutationCommitted();
  return { workoutId: newWorkoutId, markers };
}

/** The subset of the active profile repeatLastWorkout needs to convert
 * historical seeds into the current unit at creation time (task-1). */
export interface RepeatWorkoutProfile {
  units: 'kg' | 'lb';
  weightStep: number;
}

export function useRepeatLastWorkout(
  userId: string | undefined,
  profile: RepeatWorkoutProfile,
  onError?: (msg: string) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Not signed in');
      return repeatLastWorkout(userId, profile.units, profile.weightStep);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    // Never surface raw err.message in the toast (backlog 8.5) — friendly copy
    // for the user, the real error to error reporting.
    onError: (err) => {
      reportError(err, { mutation: 'repeatLastWorkout' });
      onError?.('Could not repeat the workout. Please try again.');
    },
  });
}
