/**
 * Phase 2 exit criterion:
 *   "Can create a workout, add sets, finish, quit app with airplane mode on,
 *    relaunch, go online → server reflects exactly what SQLite has."
 *
 * We simulate this end-to-end without talking to Supabase by mocking the
 * auth/supabase module with an in-memory Postgres stand-in. After a fully
 * offline workout session, we flip "online = true", run pushOutbox, and
 * verify that the mocked server received exactly the sequence of mutations
 * SQLite has committed locally.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { pushOutbox } from '@/sync/push';
import { setSyncState } from '@/sync/state';

interface ServerRow {
  table: string;
  op: string;
  row_id: string;
  payload: Record<string, unknown>;
}

const serverLog: ServerRow[] = [];

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => {
    const chain = {
      _table: table,
      _op: '' as string,
      _payload: {} as Record<string, unknown>,
      _eqId: null as string | null,
      insert(p: Record<string, unknown>) {
        serverLog.push({ table, op: 'insert', row_id: String(p.id), payload: p });
        return Promise.resolve({ error: null });
      },
      upsert(p: Record<string, unknown>) {
        serverLog.push({ table, op: 'upsert', row_id: String(p.id), payload: p });
        return Promise.resolve({ error: null });
      },
      update(p: Record<string, unknown>) {
        this._op = 'update';
        this._payload = p;
        return this;
      },
      eq(_col: string, val: string) {
        this._eqId = val;
        serverLog.push({
          table,
          op: this._op,
          row_id: val,
          payload: this._payload,
        });
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  };

  return {
    supabase: {
      from: (t: string) => builder(t),
    },
  };
});

const USER_ID = 'user-under-test';

beforeEach(async () => {
  serverLog.length = 0;
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

test('offline workout end-to-end → outbox drain matches local state', async () => {
  // 1. Seed a global exercise locally (pretend it was pulled previously).
  const exerciseId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    [exerciseId, 'Bench Press', 'Chest', new Date().toISOString(), new Date().toISOString()],
  );

  // 2. Fully offline workout flow.
  const workoutId = await createWorkout({ userId: USER_ID, title: 'Push day' });
  const weId = await addExerciseToWorkout({ workoutId, exerciseId });
  const setA = await addSet(weId, { weight: 60, reps: 10 });
  const setB = await addSet(weId, { weight: 80, reps: 5 });
  await updateSet(setA, { completed: true });
  await updateSet(setB, { completed: true });
  await finishWorkout(workoutId);

  // 3. Local state reflects the session.
  const localWorkout = await db.getFirstAsync<{
    id: string;
    title: string;
    ended_at: string | null;
  }>('SELECT id, title, ended_at FROM workouts WHERE id = ?', [workoutId]);
  expect(localWorkout?.title).toBe('Push day');
  expect(localWorkout?.ended_at).not.toBeNull();

  const localSets = await db.getAllAsync<{
    id: string;
    completed: number;
    weight: number | null;
  }>('SELECT id, completed, weight FROM sets WHERE workout_exercise_id = ? ORDER BY order_index', [
    weId,
  ]);
  expect(localSets).toHaveLength(2);
  expect(localSets.every((s) => s.completed === 1)).toBe(true);

  // 4. Outbox holds the full sequence awaiting push.
  const outbox = await db.getAllAsync<{ table_name: string; op: string; row_id: string }>(
    'SELECT table_name, op, row_id FROM outbox ORDER BY id ASC',
  );
  expect(outbox.length).toBeGreaterThan(0);

  // 5. "Come back online" → drain the outbox.
  setSyncState({ online: true });
  await pushOutbox();

  // 6. Server received every intent, in order, with the right row_ids.
  expect(serverLog.length).toBe(outbox.length);
  expect(serverLog.map((r) => r.row_id)).toEqual(outbox.map((r) => r.row_id));
  expect(serverLog.map((r) => r.op)).toEqual(outbox.map((r) => r.op));

  // 7. Outbox drained.
  const remaining = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  expect(remaining?.c).toBe(0);

  // 8. Specific shape check: finish step was a workouts update setting ended_at.
  const finishStep = serverLog.find(
    (r) => r.table === 'workouts' && r.op === 'update' && r.row_id === workoutId,
  );
  expect(finishStep?.payload).toHaveProperty('ended_at');
});

test('push retries on failure and keeps row in outbox', async () => {
  const workoutId = await createWorkout({ userId: USER_ID, title: 'Flaky' });
  expect(workoutId).toBeTruthy();
  setSyncState({ online: true });

  // Make the server reject inserts once.
  const supa = (jest.requireMock('@/auth/supabase') as { supabase: { from: unknown } }).supabase;
  const originalFrom = supa.from;
  let failed = false;
  supa.from = (t: string) => {
    const chain = (originalFrom as (t: string) => Record<string, unknown>)(t);
    const realInsert = chain.insert as (p: Record<string, unknown>) => Promise<{ error: unknown }>;
    chain.insert = (p: Record<string, unknown>) => {
      if (!failed) {
        failed = true;
        return Promise.resolve({ error: { message: 'network down' } });
      }
      return realInsert(p);
    };
    return chain;
  };

  await pushOutbox();

  const db = await getDb();
  const stuck = await db.getFirstAsync<{ attempts: number; last_error: string | null }>(
    'SELECT attempts, last_error FROM outbox WHERE table_name = ?',
    ['workouts'],
  );
  expect(stuck?.attempts).toBe(1);
  expect(stuck?.last_error).toContain('network down');
});
