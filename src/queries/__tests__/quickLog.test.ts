import { getDb, initDb, resetDbForTests } from '@/db/client';
import { startQuickLog } from '@/queries/quickLog';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'ql-user';
const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['ex-pu', 'Pull-up', 'Back', null, T, T],
  );
});

test('quick log creates an active workout titled after the exercise, with one staged set', async () => {
  const { workoutId, weId } = await startQuickLog({ userId: USER, exerciseId: 'ex-pu' });

  const db = await getDb();
  const workout = await db.getFirstAsync<{ title: string; ended_at: string | null }>(
    'SELECT title, ended_at FROM workouts WHERE id = ?',
    [workoutId],
  );
  expect(workout?.title).toBe('Pull-up');
  expect(workout?.ended_at).toBeNull(); // a normal ACTIVE workout underneath

  const we = await db.getFirstAsync<{ exercise_id: string; order_index: number }>(
    'SELECT exercise_id, order_index FROM workout_exercises WHERE id = ?',
    [weId],
  );
  expect(we).toEqual({ exercise_id: 'ex-pu', order_index: 0 });

  // Never-empty contract: one EMPTY staged set (no history prefill — the
  // staged-marker constraint, see spec).
  const sets = await db.getAllAsync<{
    weight: number | null;
    reps: number | null;
    completed: number;
  }>(
    'SELECT weight, reps, completed FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL',
    [weId],
  );
  expect(sets).toEqual([{ weight: null, reps: null, completed: 0 }]);
});

test('quick log enqueues outbox ops for workout, exercise row, and set', async () => {
  await startQuickLog({ userId: USER, exerciseId: 'ex-pu' });

  const db = await getDb();
  const ops = await db.getAllAsync<{ table_name: string; op: string }>(
    'SELECT table_name, op FROM outbox ORDER BY id',
  );
  expect(ops.map((o) => `${o.table_name}:${o.op}`)).toEqual([
    'workouts:insert',
    'workout_exercises:insert',
    'sets:insert',
  ]);
});

test('a failure after the workout insert soft-deletes it (no stranded active workout)', async () => {
  const exercises = await import('@/queries/exercises');
  const spy = jest
    .spyOn(exercises, 'addExerciseToWorkout')
    .mockRejectedValueOnce(new Error('database is locked'));

  await expect(startQuickLog({ userId: USER, exerciseId: 'ex-pu' })).rejects.toThrow(
    'database is locked',
  );

  const db = await getDb();
  const active = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM workouts WHERE user_id = ? AND ended_at IS NULL AND deleted_at IS NULL`,
    [USER],
  );
  expect(active?.c).toBe(0); // compensating delete ran — retry is unblocked
  spy.mockRestore();
});

test('a missing exercise row falls back to the default day-of-week title', async () => {
  const { workoutId } = await startQuickLog({ userId: USER, exerciseId: 'ghost' });

  const db = await getDb();
  const workout = await db.getFirstAsync<{ title: string }>(
    'SELECT title FROM workouts WHERE id = ?',
    [workoutId],
  );
  // createWorkout's default titles are day names; asserting non-empty and not
  // the ghost id keeps this locale/clock independent.
  expect(workout?.title).toBeTruthy();
  expect(workout?.title).not.toBe('ghost');
});
