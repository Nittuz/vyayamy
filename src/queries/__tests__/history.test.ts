import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getHistory } from '@/queries/history';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'hist-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedWorkout(args: {
  id: string;
  startedAt: string;
  ended?: boolean;
  deleted?: boolean;
  userId?: string;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      args.id,
      args.userId ?? USER,
      args.startedAt,
      args.ended === false ? null : `${args.startedAt}`,
      'Push',
      T,
      T,
      args.deleted ? T : null,
    ],
  );
}
async function seedWE(id: string, workoutId: string, deleted = false) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, workoutId, 'ex', 0, T, T, deleted ? T : null],
  );
}
async function seedSet(args: {
  id: string;
  weId: string;
  weight: number;
  reps: number;
  completed: boolean;
  deleted?: boolean;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      args.id,
      args.weId,
      0,
      args.weight,
      args.reps,
      args.completed ? 1 : 0,
      T,
      T,
      args.deleted ? T : null,
    ],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

test('returns only finished, non-deleted workouts for the user', async () => {
  await seedWorkout({ id: 'finished', startedAt: '2026-02-01T10:00:00.000Z' });
  await seedWorkout({ id: 'active', startedAt: '2026-02-02T10:00:00.000Z', ended: false });
  await seedWorkout({ id: 'deleted', startedAt: '2026-02-03T10:00:00.000Z', deleted: true });
  await seedWorkout({
    id: 'other-user',
    startedAt: '2026-02-04T10:00:00.000Z',
    userId: 'someone-else',
  });

  const rows = await getHistory(USER);
  expect(rows.map((r) => r.id)).toEqual(['finished']);
});

test('orders by started_at descending', async () => {
  await seedWorkout({ id: 'old', startedAt: '2026-02-01T10:00:00.000Z' });
  await seedWorkout({ id: 'new', startedAt: '2026-02-10T10:00:00.000Z' });
  await seedWorkout({ id: 'mid', startedAt: '2026-02-05T10:00:00.000Z' });

  const rows = await getHistory(USER);
  expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
});

test('computes exercise, set, completed-set counts and volume', async () => {
  await seedWorkout({ id: 'w', startedAt: '2026-02-01T10:00:00.000Z' });
  await seedWE('we1', 'w');
  await seedWE('we2', 'w');
  await seedWE('we-deleted', 'w', true);
  await seedSet({ id: 's1', weId: 'we1', weight: 100, reps: 5, completed: true }); // vol 500
  await seedSet({ id: 's2', weId: 'we1', weight: 50, reps: 10, completed: true }); // vol 500
  await seedSet({ id: 's3', weId: 'we2', weight: 80, reps: 3, completed: false }); // not completed -> excluded from vol/completed
  await seedSet({
    id: 's-del',
    weId: 'we1',
    weight: 999,
    reps: 999,
    completed: true,
    deleted: true,
  });

  const [row] = await getHistory(USER);
  expect(row!.exercise_count).toBe(2);
  expect(row!.set_count).toBe(3); // s1, s2, s3 (deleted excluded)
  expect(row!.completed_set_count).toBe(2);
  expect(row!.volume).toBe(1000);
});

test('reports zero volume for a workout with no completed sets', async () => {
  await seedWorkout({ id: 'w', startedAt: '2026-02-01T10:00:00.000Z' });
  await seedWE('we1', 'w');
  await seedSet({ id: 's1', weId: 'we1', weight: 100, reps: 5, completed: false });

  const [row] = await getHistory(USER);
  expect(row!.volume).toBe(0);
  expect(row!.completed_set_count).toBe(0);
});

test('honors limit and offset for pagination', async () => {
  for (let i = 0; i < 5; i++) {
    // started_at ascending by index so descending order is 4,3,2,1,0
    await seedWorkout({ id: `w${i}`, startedAt: `2026-02-0${i + 1}T10:00:00.000Z` });
  }
  const firstPage = await getHistory(USER, 2, 0);
  const secondPage = await getHistory(USER, 2, 2);
  expect(firstPage.map((r) => r.id)).toEqual(['w4', 'w3']);
  expect(secondPage.map((r) => r.id)).toEqual(['w2', 'w1']);
});
