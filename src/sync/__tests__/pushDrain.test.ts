/**
 * Regression guard for deep-review #5:
 *   "Push drains at most 50 rows per trigger, never loops, and nothing ever
 *    wakes up backed-off rows."
 *
 * (1) One pushOutbox() drains the whole outbox across passes — including a
 *     row's update that was held behind its insert by the #0 ordering rule.
 * (2) When a row backs off, a retry is scheduled for its next_attempt_at so it
 *     recovers without waiting for the next user action.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { createWorkout } from '@/queries/workouts';
import { __setRetryScheduler, pushOutbox } from '@/sync/push';
import { setSyncState } from '@/sync/state';

// eslint-disable-next-line no-var
var mockFailTable: string | null;

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => ({
    _eq: '' as string,
    upsert(_p: Record<string, unknown>) {
      if (mockFailTable === table) {
        return Promise.resolve({ error: { message: 'check constraint failed' } }); // non-transient
      }
      return Promise.resolve({ error: null });
    },
    update(_p: Record<string, unknown>) {
      return this;
    },
    eq(_col: string, val: string) {
      this._eq = val;
      return this;
    },
    select(_cols: string) {
      return Promise.resolve({ data: [{ id: this._eq }], error: null });
    },
  });
  return { supabase: { from: (t: string) => builder(t) } };
});

const USER = 'user-drain';
let scheduledDelays: number[];

beforeEach(async () => {
  mockFailTable = null;
  scheduledDelays = [];
  __setRetryScheduler((ms) => scheduledDelays.push(ms));
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

afterAll(() => __setRetryScheduler(null));

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

test('one push drains the whole outbox, including a row update held behind its insert (#5)', async () => {
  const weId = await seedWe();
  const setId = await addSet(weId, { weight: 100, reps: 5, units: 'kg' }); // insert
  await updateSet(setId, { reps: 6 }); // update queued behind it

  setSyncState({ online: true });
  await pushOutbox();

  const db = await getDb();
  const left = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  expect(left?.c).toBe(0); // multi-pass drain emptied it in a single call
});

test('a backed-off row schedules a retry for its next_attempt_at (#5)', async () => {
  mockFailTable = 'workouts'; // the workout insert fails non-transiently → backoff
  await createWorkout({ userId: USER, title: 'Doomed' });

  setSyncState({ online: true });
  await pushOutbox();

  const db = await getDb();
  const row = await db.getFirstAsync<{ next_attempt_at: string | null; attempts: number }>(
    `SELECT next_attempt_at, attempts FROM outbox WHERE table_name = 'workouts'`,
  );
  expect(row?.attempts).toBe(1);
  expect(row?.next_attempt_at).not.toBeNull();
  // A wake-up was scheduled for roughly the backoff window (> 0).
  expect(scheduledDelays.length).toBeGreaterThan(0);
  expect(Math.max(...scheduledDelays)).toBeGreaterThan(0);
});
