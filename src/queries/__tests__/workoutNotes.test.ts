import { getDb, initDb, resetDbForTests } from '@/db/client';
import { setExerciseNote, setWorkoutNote } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'note-user';
const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['w1', USER, T, 'W', T, T],
  );
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['we1', 'w1', 'ex1', 0, T, T],
  );
});

test('setWorkoutNote writes the row and enqueues one outbox op', async () => {
  await setWorkoutNote('w1', 'low energy, no carbs');

  const db = await getDb();
  const row = await db.getFirstAsync<{ note: string | null }>(
    'SELECT note FROM workouts WHERE id = ?',
    ['w1'],
  );
  expect(row?.note).toBe('low energy, no carbs');

  const outbox = await db.getAllAsync<{ table_name: string; op: string; payload_json: string }>(
    `SELECT table_name, op, payload_json FROM outbox WHERE table_name = 'workouts'`,
  );
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.op).toBe('update');
  expect(JSON.parse(outbox[0]!.payload_json)).toMatchObject({
    id: 'w1',
    note: 'low energy, no carbs',
  });
});

test('setExerciseNote writes the row and enqueues one outbox op', async () => {
  await setExerciseNote('we1', 'grip slipped on set 3');

  const db = await getDb();
  const row = await db.getFirstAsync<{ note: string | null }>(
    'SELECT note FROM workout_exercises WHERE id = ?',
    ['we1'],
  );
  expect(row?.note).toBe('grip slipped on set 3');

  const outbox = await db.getAllAsync<{ op: string }>(
    `SELECT op FROM outbox WHERE table_name = 'workout_exercises'`,
  );
  expect(outbox).toHaveLength(1);
});

test('whitespace-only notes normalize to null (clearing a note)', async () => {
  await setWorkoutNote('w1', 'real note');
  await setWorkoutNote('w1', '   ');

  const db = await getDb();
  const row = await db.getFirstAsync<{ note: string | null }>(
    'SELECT note FROM workouts WHERE id = ?',
    ['w1'],
  );
  expect(row?.note).toBeNull();
});

test('notes are trimmed before storage', async () => {
  await setWorkoutNote('w1', '  felt strong today  ');
  const db = await getDb();
  const row = await db.getFirstAsync<{ note: string | null }>(
    'SELECT note FROM workouts WHERE id = ?',
    ['w1'],
  );
  expect(row?.note).toBe('felt strong today');
});
