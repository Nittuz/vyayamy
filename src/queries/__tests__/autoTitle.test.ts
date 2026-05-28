import { getDb, initDb, resetDbForTests } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { createWorkout, maybeUpdateAutoTitle } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'auto-title-user';
const EX1 = '11111111-1111-1111-1111-111111111111';
const EX2 = '22222222-2222-2222-2222-222222222222';
const EX3 = '33333333-3333-3333-3333-333333333333';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX1, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX2, 'Tricep Pushdown', 'Triceps', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX3, 'Lateral Raise', 'Shoulders', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('maybeUpdateAutoTitle does nothing with fewer than 3 exercises', async () => {
  const wId = await createWorkout({ userId: USER_ID });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  // Title is still the day-of-week (unmodified)
  expect(row!.title).not.toContain('+');
});

test('maybeUpdateAutoTitle composes title at 3+ exercises when title is default', async () => {
  const wId = await createWorkout({ userId: USER_ID });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX3 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  expect(row!.title).toBe('Chest + Triceps + Shoulders');
});

test('maybeUpdateAutoTitle does not overwrite a user-set title', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'My custom title' });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX1 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX2 });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX3 });
  await maybeUpdateAutoTitle(wId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ title: string }>('SELECT title FROM workouts WHERE id = ?', [wId]);
  expect(row!.title).toBe('My custom title');
});
