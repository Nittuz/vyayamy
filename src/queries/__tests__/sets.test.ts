import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet, deleteSet, listSetsForWorkoutExercise } from '@/queries/sets';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'sets-test-user';
const EX = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('addSet creates a set and queues an outbox insert', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  // addExerciseToWorkout auto-stages one set per Phase 3 — that's set 0
  const setId = await addSet(weId, { weight: 185, reps: 5 });

  const sets = await listSetsForWorkoutExercise(weId);
  // Phase 3 auto-stage = set 0; addSet above = set 1
  expect(sets).toHaveLength(2);
  expect(sets[1]!.id).toBe(setId);
  expect(sets[1]!.weight).toBe(185);
  expect(sets[1]!.reps).toBe(5);

  const db = await getDb();
  const outbox = await db.getAllAsync<{
    table_name: string;
    op: string;
    row_id: string;
  }>('SELECT table_name, op, row_id FROM outbox WHERE row_id = ?', [setId]);
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.table_name).toBe('sets');
  expect(outbox[0]!.op).toBe('insert');
});

test('updateSet marks completed_at when completed:true, clears when false', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  await updateSet(setId, { weight: 135, reps: 8, completed: true });
  let row = await (
    await getDb()
  ).getFirstAsync<{
    weight: number | null;
    reps: number | null;
    completed: number;
    completed_at: string | null;
  }>('SELECT weight, reps, completed, completed_at FROM sets WHERE id = ?', [setId]);
  expect(row!.weight).toBe(135);
  expect(row!.reps).toBe(8);
  expect(row!.completed).toBe(1);
  expect(row!.completed_at).not.toBeNull();

  await updateSet(setId, { completed: false });
  row = await (
    await getDb()
  ).getFirstAsync('SELECT weight, reps, completed, completed_at FROM sets WHERE id = ?', [setId]);
  expect(row!.completed).toBe(0);
  expect(row!.completed_at).toBeNull();
});

test('deleteSet soft-deletes the row and queues an outbox delete', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  await deleteSet(setId);

  // listSetsForWorkoutExercise filters out deleted_at IS NOT NULL
  const visible = await listSetsForWorkoutExercise(weId);
  expect(visible).toHaveLength(0);

  const db = await getDb();
  const raw = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM sets WHERE id = ?',
    [setId],
  );
  expect(raw!.deleted_at).not.toBeNull();

  const outbox = await db.getAllAsync<{ op: string }>('SELECT op FROM outbox WHERE row_id = ?', [
    setId,
  ]);
  // 1 insert (from auto-stage) + 1 delete
  expect(outbox.map((r) => r.op).sort()).toEqual(['delete', 'insert']);
});
