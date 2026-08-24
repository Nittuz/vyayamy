import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getTodaySchedule, startPlannedWorkout } from '@/queries/plannedWorkout';
import { advanceCycleCursor, saveActivePlan } from '@/queries/plans';
import { finishWorkout } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'plan-user';
const T = '2026-01-01T00:00:00.000Z';
// Default profile for tests that don't care about unit conversion — kg at the
// standard 2.5 step, which is a no-op for every kg-sourced literal below.
const KG_PROFILE = { units: 'kg' as const, weightStep: 2.5 };

async function insertExercise(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, 'Back', null, T, T],
  );
}

async function insertTemplate(id: string, name: string, exerciseOrder: string[]) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO templates (id, user_id, name, exercise_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, USER, name, JSON.stringify(exerciseOrder), T, T],
  );
}

async function insertPlan(args: {
  id: string;
  planType: 'weekly' | 'cycle';
  cursor?: number;
  slots: {
    id: string;
    templateId?: string | null;
    dayOfWeek?: number | null;
    cyclePosition?: number | null;
    isRestDay?: boolean;
  }[];
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO training_plans (id, user_id, name, plan_type, is_active, cycle_cursor, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    [args.id, USER, 'Plan', args.planType, args.cursor ?? 0, T, T],
  );
  for (const s of args.slots) {
    await db.runAsync(
      `INSERT INTO training_plan_slots (id, plan_id, template_id, day_of_week, cycle_position, is_rest_day, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        s.id,
        args.id,
        s.templateId ?? null,
        s.dayOfWeek ?? null,
        s.cyclePosition ?? null,
        s.isRestDay ? 1 : 0,
        T,
        T,
      ],
    );
  }
}

/** Seed one finished workout with a completed set, for prefill sourcing. */
async function insertHistory(
  exerciseId: string,
  set: { weight: number | null; reps: number; units: string | null },
) {
  const db = await getDb();
  const wId = `hist-w-${exerciseId}`;
  const weId = `hist-we-${exerciseId}`;
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [wId, USER, T, T, 'H', T, T],
  );
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [weId, wId, exerciseId, 0, T, T],
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, units, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?, 1, ?, ?, ?)`,
    [`hist-s-${exerciseId}`, weId, set.weight, set.reps, set.units, T, T, T],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

describe('startPlannedWorkout', () => {
  test('creates the workout with template_id stamped, exercises in template order, seeded sets', async () => {
    await insertExercise('ex-a', 'Pull-up');
    await insertExercise('ex-b', 'Row');
    await insertTemplate('tpl', 'Push Day', ['ex-b', 'ex-a']); // b first on purpose
    await insertHistory('ex-a', { weight: null, reps: 12, units: null }); // BW history
    await insertHistory('ex-b', { weight: 60, reps: 8, units: 'kg' });

    const result = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl',
      title: 'Push Day',
      ...KG_PROFILE,
    });
    const workoutId = result.workoutId;

    const db = await getDb();
    const workout = await db.getFirstAsync<{
      title: string;
      template_id: string | null;
      ended_at: string | null;
    }>('SELECT title, template_id, ended_at FROM workouts WHERE id = ?', [workoutId]);
    expect(workout).toEqual({ title: 'Push Day', template_id: 'tpl', ended_at: null });

    const wes = await db.getAllAsync<{ exercise_id: string; order_index: number }>(
      'SELECT exercise_id, order_index FROM workout_exercises WHERE workout_id = ? ORDER BY order_index',
      [workoutId],
    );
    expect(wes).toEqual([
      { exercise_id: 'ex-b', order_index: 0 },
      { exercise_id: 'ex-a', order_index: 1 },
    ]);

    // Seeds: one incomplete set per exercise, prefilled from history with unit
    // provenance; bodyweight history seeds null weight.
    const sets = await db.getAllAsync<{
      id: string;
      weight: number | null;
      reps: number | null;
      units: string | null;
      completed: number;
    }>(
      `SELECT s.id, s.weight, s.reps, s.units, s.completed FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ? ORDER BY we.order_index`,
      [workoutId],
    );
    expect(
      sets.map((s) => ({ weight: s.weight, reps: s.reps, units: s.units, completed: s.completed })),
    ).toEqual([
      { weight: 60, reps: 8, units: 'kg', completed: 0 },
      { weight: null, reps: 12, units: null, completed: 0 },
    ]);

    // Returned descriptors are the provenance handoff (task-1 /
    // pendingSeedMarkers) — must exactly match the inserted rows' ids+values,
    // in the same order, including the bodyweight (null-weight) seed: reps
    // alone is still a value worth confirming/last-timing on.
    expect(result.markers).toEqual([
      { id: sets[0]!.id, weight: 60, reps: 8, source: 'history' },
      { id: sets[1]!.id, weight: null, reps: 12, source: 'history' },
    ]);
  });

  test('converts seeds into the CURRENT profile unit at creation, mixed units (task-1)', async () => {
    // Bug: the seeded row used to carry the RAW historical weight/units — a
    // kg seed under an lb profile rendered as e.g. "52.5 LB" (wrong number
    // under the right-looking badge). The fix converts+rounds into the
    // CURRENT profile unit at creation time, same convention planFirstSet
    // uses for in-session prefill.
    await insertExercise('ex-a', 'Pull-up');
    await insertExercise('ex-b', 'Row');
    await insertTemplate('tpl-lb', 'Push Day', ['ex-b', 'ex-a']);
    await insertHistory('ex-a', { weight: null, reps: 12, units: null }); // BW history
    await insertHistory('ex-b', { weight: 52.5, reps: 3, units: 'kg' });

    const result = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl-lb',
      title: 'Push Day',
      units: 'lb',
      weightStep: 5,
    });
    const workoutId = result.workoutId;

    const db = await getDb();
    const sets = await db.getAllAsync<{
      id: string;
      weight: number | null;
      reps: number | null;
      units: string | null;
      completed: number;
    }>(
      `SELECT s.id, s.weight, s.reps, s.units, s.completed FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ? ORDER BY we.order_index`,
      [workoutId],
    );
    // 52.5 kg -> lb = 115.7426...; nearest 5 = 115 (computed from the real
    // convertWeight/round helpers, not hand-picked — see activeSet.ts). The
    // BW seed stays null/null-units — no conversion applies to it.
    expect(
      sets.map((s) => ({ weight: s.weight, reps: s.reps, units: s.units, completed: s.completed })),
    ).toEqual([
      { weight: 115, reps: 3, units: 'lb', completed: 0 },
      { weight: null, reps: 12, units: null, completed: 0 },
    ]);

    // Descriptor-pinning, extended to a MIXED-unit case (task-1 §3): markers
    // must carry the CONVERTED values, matching the rows just inserted.
    expect(result.markers).toEqual([
      { id: sets[0]!.id, weight: 115, reps: 3, source: 'history' },
      { id: sets[1]!.id, weight: null, reps: 12, source: 'history' },
    ]);
  });

  test('same-unit seed still rounds to the profile step (rounding matters vs not)', async () => {
    await insertExercise('ex-c', 'Squat');
    await insertExercise('ex-d', 'Deadlift');
    await insertTemplate('tpl-round', 'Legs', ['ex-c', 'ex-d']);
    // Already an exact multiple of the 2.5 step — rounding is a no-op.
    await insertHistory('ex-c', { weight: 52.5, reps: 5, units: 'kg' });
    // NOT a multiple of 2.5 — rounding must actually change the value (53 -> 52.5).
    await insertHistory('ex-d', { weight: 53, reps: 5, units: 'kg' });

    const result = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl-round',
      title: 'Legs',
      units: 'kg',
      weightStep: 2.5,
    });

    const db = await getDb();
    const sets = await db.getAllAsync<{ weight: number | null; units: string | null }>(
      `SELECT s.weight, s.units FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ? ORDER BY we.order_index`,
      [result.workoutId],
    );
    expect(sets).toEqual([
      { weight: 52.5, units: 'kg' }, // unchanged: already on-step
      { weight: 52.5, units: 'kg' }, // rounded: 53 -> 52.5
    ]);
  });

  test('a never-done exercise seeds an empty set with no marker', async () => {
    await insertExercise('ex-new', 'Dips');
    await insertTemplate('tpl', 'Day', ['ex-new']);

    const result = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl',
      title: 'Day',
      ...KG_PROFILE,
    });
    const workoutId = result.workoutId;
    expect(result.markers).toEqual([]);

    const db = await getDb();
    const set = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
      `SELECT s.weight, s.reps FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ?`,
      [workoutId],
    );
    expect(set).toEqual({ weight: null, reps: null });
  });

  test('missing/deleted exercise ids are skipped, order compacted', async () => {
    await insertExercise('ex-live', 'Row');
    await insertTemplate('tpl', 'Day', ['ghost', 'ex-live']);

    const { workoutId } = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl',
      title: 'Day',
      ...KG_PROFILE,
    });

    const db = await getDb();
    const wes = await db.getAllAsync<{ exercise_id: string; order_index: number }>(
      'SELECT exercise_id, order_index FROM workout_exercises WHERE workout_id = ?',
      [workoutId],
    );
    expect(wes).toEqual([{ exercise_id: 'ex-live', order_index: 0 }]);
  });

  test('a template with no resolvable exercises throws and writes nothing', async () => {
    await insertTemplate('tpl-empty', 'Empty', ['ghost-1', 'ghost-2']);

    await expect(
      startPlannedWorkout({ userId: USER, templateId: 'tpl-empty', title: 'Empty', ...KG_PROFILE }),
    ).rejects.toThrow();

    const db = await getDb();
    const count = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM workouts WHERE user_id = ?',
      [USER],
    );
    expect(count?.c).toBe(0);
  });
});

describe('getTodaySchedule', () => {
  test('a cycle cursor parked on an unconfigured slot surfaces a skippable gap', async () => {
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 0,
      slots: [{ id: 's0', templateId: null, cyclePosition: 0 }],
    });
    expect(await getTodaySchedule(USER, 2)).toEqual({
      kind: 'gap',
      planName: 'Plan',
      planType: 'cycle',
    });
  });

  test('a weekly unconfigured slot collapses to none (the calendar moves on)', async () => {
    await insertPlan({
      id: 'plan',
      planType: 'weekly',
      slots: [{ id: 's0', templateId: null, dayOfWeek: 2 }],
    });
    expect(await getTodaySchedule(USER, 2)).toEqual({ kind: 'none' });
  });

  test('a cycle template with no resolvable exercises is a gap, not a dead-end card', async () => {
    await insertTemplate('tpl-ghosts', 'Ghosts', ['ghost-1']);
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 0,
      slots: [{ id: 's0', templateId: 'tpl-ghosts', cyclePosition: 0 }],
    });
    expect(await getTodaySchedule(USER, 2)).toMatchObject({ kind: 'gap' });
  });

  test('a scheduled weekly day hydrates the card with names and template title', async () => {
    await insertExercise('ex', 'Row');
    await insertTemplate('tpl', 'Pull Day', ['ex']);
    await insertPlan({
      id: 'plan',
      planType: 'weekly',
      slots: [{ id: 's0', templateId: 'tpl', dayOfWeek: 4 }],
    });
    expect(await getTodaySchedule(USER, 4)).toEqual({
      kind: 'workout',
      title: 'Pull Day',
      templateId: 'tpl',
      planName: 'Plan',
      planType: 'weekly',
      exerciseNames: ['Row'],
    });
  });
});

describe('saveActivePlan cursor preservation', () => {
  test('editing an existing plan preserves the cycle cursor instead of resetting to 0', async () => {
    await insertTemplate('tpl', 'A', []);
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 3,
      slots: [
        { id: 's0', templateId: 'tpl', cyclePosition: 0 },
        { id: 's1', templateId: 'tpl', cyclePosition: 1 },
        { id: 's2', templateId: 'tpl', cyclePosition: 2 },
        { id: 's3', templateId: 'tpl', cyclePosition: 3 },
      ],
    });

    await saveActivePlan({
      userId: USER,
      planId: 'plan',
      name: 'Renamed mid-cycle',
      planType: 'cycle',
      slots: [0, 1, 2, 3].map((i) => ({
        templateId: 'tpl',
        cyclePosition: i,
        isRestDay: false,
        label: null,
      })),
    });

    const db = await getDb();
    const plan = await db.getFirstAsync<{ cycle_cursor: number; name: string }>(
      'SELECT cycle_cursor, name FROM training_plans WHERE id = ?',
      ['plan'],
    );
    expect(plan).toEqual({ cycle_cursor: 3, name: 'Renamed mid-cycle' });
  });
});

describe('cycle cursor advancement', () => {
  test('finishing the scheduled cycle workout advances the cursor with wrap', async () => {
    await insertExercise('ex', 'Row');
    await insertTemplate('tpl-a', 'A', ['ex']);
    await insertTemplate('tpl-b', 'B', ['ex']);
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 1,
      slots: [
        { id: 's0', templateId: 'tpl-a', cyclePosition: 0 },
        { id: 's1', templateId: 'tpl-b', cyclePosition: 1 },
      ],
    });

    const { workoutId } = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl-b',
      title: 'B',
      ...KG_PROFILE,
    });
    await finishWorkout(workoutId, USER);

    const db = await getDb();
    const plan = await db.getFirstAsync<{ cycle_cursor: number }>(
      'SELECT cycle_cursor FROM training_plans WHERE id = ?',
      ['plan'],
    );
    expect(plan?.cycle_cursor).toBe(0); // wrapped 1 -> 0
  });

  test('finishing a workout whose template does not match the current slot leaves the cursor alone', async () => {
    await insertExercise('ex', 'Row');
    await insertTemplate('tpl-a', 'A', ['ex']);
    await insertTemplate('tpl-b', 'B', ['ex']);
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 0,
      slots: [
        { id: 's0', templateId: 'tpl-a', cyclePosition: 0 },
        { id: 's1', templateId: 'tpl-b', cyclePosition: 1 },
      ],
    });

    // The user starts slot B's template out of order.
    const { workoutId } = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl-b',
      title: 'B',
      ...KG_PROFILE,
    });
    await finishWorkout(workoutId, USER);

    const db = await getDb();
    const plan = await db.getFirstAsync<{ cycle_cursor: number }>(
      'SELECT cycle_cursor FROM training_plans WHERE id = ?',
      ['plan'],
    );
    expect(plan?.cycle_cursor).toBe(0);
  });

  test('ad-hoc workouts (no template) and weekly plans never move the cursor', async () => {
    await insertExercise('ex', 'Row');
    await insertTemplate('tpl-a', 'A', ['ex']);
    await insertPlan({
      id: 'plan-weekly',
      planType: 'weekly',
      slots: [{ id: 's0', templateId: 'tpl-a', dayOfWeek: 2 }],
    });

    // Ad-hoc workout (no template_id).
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['w-adhoc', USER, T, 'Adhoc', T, T],
    );
    await finishWorkout('w-adhoc', USER);

    // Weekly plan finish with matching template.
    const { workoutId } = await startPlannedWorkout({
      userId: USER,
      templateId: 'tpl-a',
      title: 'A',
      ...KG_PROFILE,
    });
    await finishWorkout(workoutId, USER);

    const plan = await db.getFirstAsync<{ cycle_cursor: number }>(
      'SELECT cycle_cursor FROM training_plans WHERE id = ?',
      ['plan-weekly'],
    );
    expect(plan?.cycle_cursor).toBe(0);
  });

  test('advanceCycleCursor (skip rest) advances unconditionally with wrap', async () => {
    await insertPlan({
      id: 'plan',
      planType: 'cycle',
      cursor: 2,
      slots: [
        { id: 's0', cyclePosition: 0, isRestDay: true },
        { id: 's1', cyclePosition: 1, isRestDay: true },
        { id: 's2', cyclePosition: 2, isRestDay: true },
      ],
    });

    await advanceCycleCursor(USER);

    const db = await getDb();
    const plan = await db.getFirstAsync<{ cycle_cursor: number }>(
      'SELECT cycle_cursor FROM training_plans WHERE id = ?',
      ['plan'],
    );
    expect(plan?.cycle_cursor).toBe(0);
  });
});
