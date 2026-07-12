/**
 * Per-set units write path (#131/#133). A set stores the unit its weight was
 * logged in, and that unit propagates to the outbox so the server mirror agrees.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { createWorkout } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));

const USER_ID = 'user-set-units';

async function seedWorkoutExercise(): Promise<string> {
  const db = await getDb();
  const exerciseId = uuidv4();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
    [exerciseId, 'Bench', new Date().toISOString(), new Date().toISOString()],
  );
  const workoutId = await createWorkout({ userId: USER_ID, title: 'Push' });
  return addExerciseToWorkout({ workoutId, exerciseId });
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

test('addSet stores the logging unit and enqueues it', async () => {
  const weId = await seedWorkoutExercise();
  const db = await getDb();

  const setId = await addSet(weId, { weight: 100, reps: 5, units: 'lb' });

  const row = await db.getFirstAsync<{ units: string | null }>(
    'SELECT units FROM sets WHERE id = ?',
    [setId],
  );
  expect(row?.units).toBe('lb');

  const outbox = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM outbox WHERE row_id = ? AND op = 'insert'`,
    [setId],
  );
  expect(JSON.parse(outbox!.payload_json).units).toBe('lb');
});

test('an empty staged set carries no unit until a weight is written', async () => {
  const weId = await seedWorkoutExercise();
  const db = await getDb();

  const setId = await addSet(weId); // staged, no weight
  let row = await db.getFirstAsync<{ units: string | null }>(
    'SELECT units FROM sets WHERE id = ?',
    [setId],
  );
  expect(row?.units).toBeNull();

  // Entering a weight under the kg preference stamps the unit.
  await updateSet(setId, { weight: 60, units: 'kg' });
  row = await db.getFirstAsync<{ units: string | null }>('SELECT units FROM sets WHERE id = ?', [
    setId,
  ]);
  expect(row?.units).toBe('kg');

  const outbox = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM outbox WHERE row_id = ? AND op = 'update' ORDER BY id DESC`,
    [setId],
  );
  expect(JSON.parse(outbox!.payload_json).units).toBe('kg');
});
