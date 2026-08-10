/**
 * Start a workout from a plan template (spec 2026-08-10-plan-reaches-today).
 *
 * The whole seed — workout (with template_id stamped, the column's first real
 * writer), one workout_exercise per template entry, one set per exercise —
 * commits in ONE transaction (repeatLastWorkout pattern, #20), so a crash
 * mid-seed can't strand a half-built active workout. Seeds are prefilled from
 * each exercise's most recent COMPLETED set anywhere in history (unit
 * provenance carried); a never-done exercise seeds empty, keeping the
 * never-empty contract.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { resolveTodaySlot } from '@/core/planResolver';
import { getDb } from '@/db/client';
import { insertRowInTx } from '@/db/mutations';
import { withTransaction } from '@/db/transaction';
import { nowIso, uuidv4 } from '@/db/uuid';
import { emitMutationCommitted } from '@/db/mutationEvents';
import { getActivePlan, parseExerciseOrder } from '@/queries/plans';

import { queryKeys } from './keys';

/** What the active plan schedules for today, hydrated for the Today card. */
export type TodaySchedule =
  | {
      kind: 'workout';
      /** Workout/card title: slot label, else template name. */
      title: string;
      templateId: string;
      planName: string;
      planType: 'weekly' | 'cycle';
      exerciseNames: string[];
    }
  | { kind: 'rest'; planName: string; planType: 'weekly' | 'cycle' }
  /** The cycle cursor is parked on a slot that can't produce a workout —
   *  unconfigured, template deleted, or zero resolvable exercises. Surfaced
   *  (not collapsed to 'none') so the skip affordance can advance the cursor;
   *  otherwise the cycle stalls forever (review finding). Weekly plans
   *  collapse the same states to 'none' — the calendar moves past them. */
  | { kind: 'gap'; planName: string; planType: 'cycle' }
  | { kind: 'none' };

export async function getTodaySchedule(userId: string, todayDow: number): Promise<TodaySchedule> {
  const active = await getActivePlan(userId);
  if (!active) return { kind: 'none' };
  const gapOrNone = (): TodaySchedule =>
    active.plan.plan_type === 'cycle'
      ? { kind: 'gap', planName: active.plan.name, planType: 'cycle' }
      : { kind: 'none' };

  const resolution = resolveTodaySlot(active.plan, active.slots, todayDow);
  if (resolution.kind === 'rest') {
    return { kind: 'rest', planName: active.plan.name, planType: active.plan.plan_type };
  }
  if (resolution.kind === 'unconfigured') return gapOrNone();
  if (resolution.kind === 'none') return { kind: 'none' };
  const template = active.templates.get(resolution.templateId);
  if (!template) return gapOrNone(); // template deleted — nothing to start

  const db = await getDb();
  const exerciseNames: string[] = [];
  for (const exId of parseExerciseOrder(template.exercise_order)) {
    const row = await db.getFirstAsync<{ name: string }>(
      'SELECT name FROM exercises WHERE id = ? AND deleted_at IS NULL',
      [exId],
    );
    if (row) exerciseNames.push(row.name);
  }
  // A card whose Start would throw (zero resolvable exercises) is a dead end —
  // treat it as a gap/none instead (review finding).
  if (exerciseNames.length === 0) return gapOrNone();

  const label = resolution.slot.label?.trim();
  return {
    kind: 'workout',
    title: label ? label : template.name,
    templateId: resolution.templateId,
    planName: active.plan.name,
    planType: active.plan.plan_type,
    exerciseNames,
  };
}

export function useTodaySchedule(userId: string | undefined, todayDow: number) {
  return useQuery({
    queryKey: userId
      ? [...queryKeys.plans.today(userId), todayDow]
      : ['plans', 'today', 'none', todayDow],
    queryFn: () =>
      userId ? getTodaySchedule(userId, todayDow) : Promise.resolve({ kind: 'none' } as const),
    enabled: !!userId,
  });
}

interface SeedValues {
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

export async function startPlannedWorkout(args: {
  userId: string;
  templateId: string;
  title: string;
}): Promise<string> {
  const db = await getDb();
  const tpl = await db.getFirstAsync<{ exercise_order: string }>(
    'SELECT exercise_order FROM templates WHERE id = ? AND deleted_at IS NULL',
    [args.templateId],
  );
  if (!tpl) throw new Error(`startPlannedWorkout: template ${args.templateId} not found`);

  // Resolve to live exercise rows, preserving template order; a deleted or
  // missing exercise is skipped rather than blocking the whole start.
  const liveExerciseIds: string[] = [];
  for (const exId of parseExerciseOrder(tpl.exercise_order)) {
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL',
      [exId],
    );
    if (row) liveExerciseIds.push(row.id);
  }
  if (liveExerciseIds.length === 0) {
    throw new Error(`startPlannedWorkout: template ${args.templateId} has no exercises`);
  }

  // Prefill: the exercise's most recent completed set across history.
  const seeds = new Map<string, SeedValues | null>();
  for (const exId of liveExerciseIds) {
    const last = await db.getFirstAsync<SeedValues>(
      `SELECT s.weight, s.reps, s.units FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE w.user_id = ? AND we.exercise_id = ? AND s.completed = 1
          AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
        ORDER BY s.completed_at DESC LIMIT 1`,
      [args.userId, exId],
    );
    seeds.set(exId, last ?? null);
  }

  const workoutId = uuidv4();
  const now = nowIso();
  await withTransaction(db, async () => {
    await insertRowInTx(
      db,
      'workouts',
      workoutId,
      {
        user_id: args.userId,
        started_at: now,
        title: args.title,
        template_id: args.templateId,
        ended_at: null,
      },
      now,
    );
    for (const [i, exId] of liveExerciseIds.entries()) {
      const weId = uuidv4();
      await insertRowInTx(
        db,
        'workout_exercises',
        weId,
        { workout_id: workoutId, exercise_id: exId, order_index: i },
        now,
      );
      const seed = seeds.get(exId) ?? null;
      await insertRowInTx(
        db,
        'sets',
        uuidv4(),
        {
          workout_exercise_id: weId,
          order_index: 0,
          weight: seed?.weight ?? null,
          reps: seed?.reps ?? null,
          units: seed?.units ?? null,
          completed: 0,
          completed_at: null,
        },
        now,
      );
    }
  });

  emitMutationCommitted();
  return workoutId;
}

export function useStartPlannedWorkout(onError?: (msg: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startPlannedWorkout,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all }),
    onError: (err) => {
      void import('@/lib/errorReporting').then(({ captureException }) =>
        captureException(err, { mutation: 'startPlannedWorkout' }),
      );
      onError?.('Could not start the scheduled workout. Please try again.');
    },
  });
}
