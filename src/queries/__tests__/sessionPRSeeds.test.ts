import { getDb, initDb, resetDbForTests } from '@/db/client';
import { fetchAllTimePRSeeds } from '@/queries/sessionPRs';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'seed-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedWorkout(
  workoutId: string,
  weId: string,
  exerciseId: string,
  sets: { weight: number | null; reps: number | null; completed: boolean }[],
  opts: { finished?: boolean } = {},
) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [workoutId, USER, T, opts.finished === false ? null : T, 'W', T, T],
  );
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [weId, workoutId, exerciseId, 0, T, T],
  );
  let i = 0;
  for (const s of sets) {
    await db.runAsync(
      `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`${weId}-s${i}`, weId, i, s.weight, s.reps, s.completed ? 1 : 0, T, T, T],
    );
    i++;
  }
}

async function insertHeaviestRecord(exerciseId: string, kg: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO personal_records (id, user_id, exercise_id, type, value, achieved_at, created_at, updated_at)
       VALUES (?, ?, ?, 'heaviest_weight', ?, ?, ?, ?)`,
    [`pr-${exerciseId}`, USER, exerciseId, JSON.stringify(kg), T, T, T],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

test('rep seeds come from the sets table even when no most_reps cache row exists (post-upgrade window)', async () => {
  // The migration scenario: history exists, but the personal_records cache has
  // never been recomputed under the 2026-08-09 schema — no most_reps rows.
  await seedWorkout('w1', 'we1', 'ex-pullup', [
    { weight: null, reps: 20, completed: true },
    { weight: null, reps: 12, completed: true },
  ]);

  const seeds = await fetchAllTimePRSeeds(USER);
  expect(seeds.mostReps['ex-pullup']).toBe(20);
});

test('weight seeds come from the heaviest_weight cache rows', async () => {
  await insertHeaviestRecord('ex-bench', 102.5);
  const seeds = await fetchAllTimePRSeeds(USER);
  expect(seeds.heaviestKg['ex-bench']).toBe(102.5);
});

test('rep seeds ignore unfinished workouts and incomplete sets', async () => {
  await seedWorkout('w-live', 'we-live', 'ex-dips', [{ weight: null, reps: 30, completed: true }], {
    finished: false,
  });
  await seedWorkout('w-done', 'we-done', 'ex-dips', [
    { weight: null, reps: 10, completed: true },
    { weight: null, reps: 25, completed: false },
  ]);

  const seeds = await fetchAllTimePRSeeds(USER);
  expect(seeds.mostReps['ex-dips']).toBe(10);
});

test('loaded sets count toward the rep seed (matching most_reps record semantics)', async () => {
  await seedWorkout('w1', 'we1', 'ex-row', [
    { weight: 60, reps: 12, completed: true },
    { weight: null, reps: 9, completed: true },
  ]);

  const seeds = await fetchAllTimePRSeeds(USER);
  expect(seeds.mostReps['ex-row']).toBe(12);
});
