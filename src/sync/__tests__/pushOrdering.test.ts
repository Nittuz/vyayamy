/**
 * Regression guard for deep-review #0 (critical):
 *   "Outbox replays out of per-row order and never verifies row counts —
 *    silent, permanent data loss."
 *
 * (1) Per-row FIFO: a later op for a row must never ship before an earlier
 *     queued op for the SAME row (e.g. an update racing ahead of its own
 *     not-yet-acked insert). (2) A PostgREST update/delete that matches zero
 *     rows reports no error; it must be treated as a failure, not a success
 *     that deletes the outbox row.
 *
 * Seeding happens offline so the implicit `void triggerPush()` on each mutation
 * is a no-op; the test then goes online and drives pushOutbox() explicitly.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { createWorkout } from '@/queries/workouts';
import { __setPushSleepForTests, pushOutbox } from '@/sync/push';
import { setSyncState } from '@/sync/state';

interface LogRow {
  table: string;
  op: string;
  row_id: string;
}
// eslint-disable-next-line no-var
var mockServerLog: LogRow[];
// eslint-disable-next-line no-var
var mockUpdateRowCount: number;

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => ({
    _op: '' as string,
    _eq: '' as string,
    upsert(p: Record<string, unknown>) {
      mockServerLog.push({ table, op: 'upsert', row_id: String(p.id) });
      return Promise.resolve({ error: null });
    },
    update(_p: Record<string, unknown>) {
      this._op = 'update';
      return this;
    },
    eq(_col: string, val: string) {
      this._eq = val;
      return this;
    },
    select(_cols: string) {
      mockServerLog.push({ table, op: this._op, row_id: this._eq });
      const rows = mockUpdateRowCount > 0 ? [{ id: this._eq }] : [];
      return Promise.resolve({ data: rows, error: null });
    },
  });
  return { supabase: { from: (t: string) => builder(t) } };
});

const USER = 'user-ordering';

beforeEach(async () => {
  mockServerLog = [];
  mockUpdateRowCount = 1;
  await resetDbForTests();
  await initDb();
  // Offline during seeding so per-mutation triggerPush() does not drain the
  // outbox out from under the explicit pushOutbox() calls below.
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  __setPushSleepForTests(() => Promise.resolve());
});

afterAll(() => __setPushSleepForTests(null));

async function seedWe(): Promise<string> {
  const db = await getDb();
  const exerciseId = uuidv4();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
    [exerciseId, 'Bench', new Date().toISOString(), new Date().toISOString()],
  );
  const workoutId = await createWorkout({ userId: USER, title: 'Push' });
  return addExerciseToWorkout({ workoutId, exerciseId });
}

test('an update never ships ahead of the same row\'s queued insert (#0 ordering)', async () => {
  const weId = await seedWe();
  const setId = await addSet(weId, { weight: 100, reps: 5, units: 'kg' }); // insert queued
  await updateSet(setId, { reps: 6 }); // update queued behind it

  setSyncState({ online: true });
  await pushOutbox();

  // The insert shipped; the update for the same row did NOT (it waits behind it).
  expect(mockServerLog.some((r) => r.row_id === setId && r.op === 'upsert')).toBe(true);
  expect(mockServerLog.some((r) => r.row_id === setId && r.op === 'update')).toBe(false);

  const db = await getDb();
  const stillQueued = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM outbox WHERE row_id = ? AND op = 'update'`,
    [setId],
  );
  expect(stillQueued?.c).toBe(1);

  // Next cycle: the insert is gone, so the update is now free to ship in order.
  await pushOutbox();
  expect(mockServerLog.some((r) => r.row_id === setId && r.op === 'update')).toBe(true);
});

test('an update matching zero server rows is a failure, not a silent success (#0 row-count)', async () => {
  const weId = await seedWe();
  const setId = await addSet(weId, { weight: 100, reps: 5, units: 'kg' });

  setSyncState({ online: true });
  await pushOutbox(); // insert lands, outbox for setId drains

  setSyncState({ online: false });
  await updateSet(setId, { weight: 110 });
  mockUpdateRowCount = 0; // server matches nothing

  setSyncState({ online: true });
  await pushOutbox();

  const db = await getDb();
  const row = await db.getFirstAsync<{ attempts: number }>(
    `SELECT attempts FROM outbox WHERE row_id = ? AND op = 'update'`,
    [setId],
  );
  // The outbox row must survive (not silently deleted) and count as an attempt.
  expect(row).not.toBeNull();
  expect(row!.attempts).toBe(1);
});
