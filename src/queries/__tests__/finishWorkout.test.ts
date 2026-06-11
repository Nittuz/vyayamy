import { getDb, initDb, resetDbForTests } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { createWorkout, finishWorkout, getActiveWorkout, getRecentWorkouts } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'finish-test-user';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

test('finishWorkout sets ended_at and removes from active', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });

  // Active workout shows up
  let active = await getActiveWorkout(USER_ID);
  expect(active?.id).toBe(wId);

  await finishWorkout(wId);

  // No longer active
  active = await getActiveWorkout(USER_ID);
  expect(active).toBeNull();

  // Shows up in recent
  const recent = await getRecentWorkouts(USER_ID);
  expect(recent.map((w) => w.id)).toContain(wId);

  // ended_at is set
  const db = await getDb();
  const row = await db.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workouts WHERE id = ?',
    [wId],
  );
  expect(row!.ended_at).not.toBeNull();

  // Outbox has the update
  const outbox = await db.getAllAsync<{ op: string; payload_json: string }>(
    'SELECT op, payload_json FROM outbox WHERE row_id = ?',
    [wId],
  );
  const updates = outbox.filter((r) => r.op === 'update');
  expect(updates).toHaveLength(1);
  const payload = JSON.parse(updates[0]!.payload_json);
  expect(payload.ended_at).not.toBeNull();
});

test('finishWorkout soft-deletes dangling incomplete sets so history stays clean (#12)', async () => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at) VALUES ('ex','Bench',NULL,?,?)`,
    ['2026-01-01', '2026-01-01'],
  );
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' }); // auto-stages 1 empty set
  const completed = await addSet(weId, { weight: 100, reps: 5, units: 'kg' });
  await updateSet(completed, { completed: true });
  const dangling = await addSet(weId, { weight: 100, reps: 5, units: 'kg' }); // staged, never completed

  await finishWorkout(wId, USER_ID);

  // The completed set survives; the auto-staged empty set and the dangling set
  // are tombstoned (so HistoryDetail doesn't show phantom incomplete rows).
  const live = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY order_index`,
    [weId],
  );
  expect(live.map((s) => s.id)).toEqual([completed]);

  const dangled = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM sets WHERE id = ?',
    [dangling],
  );
  expect(dangled?.deleted_at).not.toBeNull();
  // The tombstone is enqueued for sync.
  const del = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM outbox WHERE row_id = ? AND op = 'delete'`,
    [dangling],
  );
  expect(del?.c).toBe(1);
});

test('finishWorkout on a never-started workout still sets ended_at', async () => {
  // Edge case: a workout created and immediately finished with no sets.
  const wId = await createWorkout({ userId: USER_ID, title: 'Aborted' });
  await finishWorkout(wId);

  const db = await getDb();
  const row = await db.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workouts WHERE id = ?',
    [wId],
  );
  expect(row!.ended_at).not.toBeNull();
});
