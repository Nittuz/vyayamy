import { getDb, initDb, resetDbForTests } from '@/db/client';
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
