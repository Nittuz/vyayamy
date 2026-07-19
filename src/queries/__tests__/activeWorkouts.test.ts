import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet } from '@/queries/sets';
import { finishOtherActiveWorkouts, getActiveWorkoutCollisions } from '@/queries/activeWorkouts';
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
  const { weId: we1 } = await addExerciseToWorkout({ workoutId: w1, exerciseId: EX_ID });
  await addSet(we1);
  await addSet(we1);

  const w2 = await createWorkout({ userId: USER_ID, title: 'Pull' });
  const { weId: we2 } = await addExerciseToWorkout({ workoutId: w2, exerciseId: EX_ID });
  await addSet(we2);

  const result = await getActiveWorkoutCollisions(USER_ID);
  expect(result.workouts).toHaveLength(2);
  // Phase 3: addExerciseToWorkout auto-stages one set, so each explicit addSet
  // call adds to that baseline (we1: 1 auto + 2 explicit = 3; we2: 1 auto + 1 explicit = 2).
  expect(result.details.get(w1)).toEqual({ setCount: 3, exerciseCount: 1 });
  expect(result.details.get(w2)).toEqual({ setCount: 2, exerciseCount: 1 });
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

test('finishOtherActiveWorkouts marks the others finished, never deletes (#111)', async () => {
  const w1 = await createWorkout({ userId: USER_ID, title: 'Push' });
  const w2 = await createWorkout({ userId: USER_ID, title: 'Pull' });
  const w3 = await createWorkout({ userId: USER_ID, title: 'Legs' });

  await finishOtherActiveWorkouts(USER_ID, w2);

  // Only the kept workout is still active.
  const after = await getActiveWorkoutCollisions(USER_ID);
  expect(after.workouts.map((w) => w.id)).toEqual([w2]);

  // The others are finished, not soft-deleted.
  const db = await getDb();
  for (const id of [w1, w3]) {
    const row = await db.getFirstAsync<{ ended_at: string | null; deleted_at: string | null }>(
      'SELECT ended_at, deleted_at FROM workouts WHERE id = ?',
      [id],
    );
    expect(row!.ended_at).not.toBeNull();
    expect(row!.deleted_at).toBeNull();
  }

  // Outbox carries ended_at updates for the others — no delete tombstones.
  const ops = await db.getAllAsync<{ op: string; row_id: string }>(
    "SELECT op, row_id FROM outbox WHERE table_name = 'workouts' AND row_id IN (?, ?)",
    [w1, w3],
  );
  expect(ops.filter((o) => o.op === 'update')).toHaveLength(2);
  expect(ops.filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('finishOtherActiveWorkouts leaves other users untouched', async () => {
  const mine = await createWorkout({ userId: USER_ID, title: 'Mine' });
  const stranger = await createWorkout({ userId: 'someone-else', title: 'Theirs' });

  await finishOtherActiveWorkouts(USER_ID, mine);

  const db = await getDb();
  const row = await db.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workouts WHERE id = ?',
    [stranger],
  );
  expect(row!.ended_at).toBeNull();
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
