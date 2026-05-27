import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet } from '@/queries/sets';
import { getActiveWorkoutCollisions } from '@/queries/activeWorkouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'user-collision-test';
const EX_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_ID, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('returns single workout when only one is active', async () => {
  await createWorkout({ userId: USER_ID, title: 'Push' });
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(1);
  expect(result.details.size).toBe(0); // details only populated on collision
});

test('returns empty when user has no active workouts', async () => {
  const w = await createWorkout({ userId: USER_ID, title: 'Push' });
  await finishWorkout(w);
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(0);
});

test('detects 2 unfinished workouts with details', async () => {
  const w1 = await createWorkout({ userId: USER_ID, title: 'Push' });
  const we1 = await addExerciseToWorkout({ workoutId: w1, exerciseId: EX_ID });
  await addSet(we1);
  await addSet(we1);

  const w2 = await createWorkout({ userId: USER_ID, title: 'Pull' });
  const we2 = await addExerciseToWorkout({ workoutId: w2, exerciseId: EX_ID });
  await addSet(we2);

  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(2);
  expect(result.details.get(w1)).toEqual({ setCount: 2, exerciseCount: 1 });
  expect(result.details.get(w2)).toEqual({ setCount: 1, exerciseCount: 1 });
});

test('returns workouts ordered by started_at DESC', async () => {
  const w1 = await createWorkout({ userId: USER_ID, title: 'Older' });
  // Force a different started_at by direct DB update — createWorkout uses now()
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET started_at = ? WHERE id = ?', [
    '2026-05-25T08:00:00.000Z',
    w1,
  ]);
  const w2 = await createWorkout({ userId: USER_ID, title: 'Newer' });

  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts[0]!.id).toBe(w2);
  expect(result.workouts[1]!.id).toBe(w1);
});

test('ignores soft-deleted workouts', async () => {
  await createWorkout({ userId: USER_ID, title: 'Active' });
  const w2 = await createWorkout({ userId: USER_ID, title: 'Deleted' });
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET deleted_at = ? WHERE id = ?', [
    new Date().toISOString(),
    w2,
  ]);
  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(1);
  expect(result.workouts[0]!.title).toBe('Active');
});
