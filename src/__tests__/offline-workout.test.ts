/**
 * Phase 2 exit criterion:
 *   "Can create a workout, add sets, finish, quit app with airplane mode on,
 *    relaunch, go online → server reflects exactly what SQLite has."
 *
 * Plus three additional regression cases:
 *   - retries on transient failure (row stays in outbox, attempts++)
 *   - quarantine after MAX_ATTEMPTS = 5
 *   - cascade soft-delete: tombstoning a workout also tombstones its
 *     workout_exercises and sets, both locally and in the outbox
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { createWorkout, deleteWorkoutLocal, finishWorkout } from '@/queries/workouts';
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
      upsert(p: Record<string, unknown>, _opts?: { onConflict?: string }) {
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
        return this;
      },
      // push.ts chains .select('id') on update/delete to verify a row matched (#0).
      select(_cols: string) {
        serverLog.push({
          table,
          op: this._op,
          row_id: this._eqId as string,
          payload: this._payload,
        });
        return Promise.resolve({ data: [{ id: this._eqId }], error: null });
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
  const exerciseId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    [exerciseId, 'Bench Press', 'Chest', new Date().toISOString(), new Date().toISOString()],
  );

  const workoutId = await createWorkout({ userId: USER_ID, title: 'Push day' });
  const weId = await addExerciseToWorkout({ workoutId, exerciseId });
  const setA = await addSet(weId, { weight: 60, reps: 10 });
  const setB = await addSet(weId, { weight: 80, reps: 5 });
  await updateSet(setA, { completed: true });
  await updateSet(setB, { completed: true });
  await finishWorkout(workoutId);

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
  }>(
    'SELECT id, completed, weight FROM sets WHERE workout_exercise_id = ? ORDER BY order_index',
    [weId],
  );
  // Phase 3: addExerciseToWorkout auto-stages one empty set (order_index 0),
  // then the two explicit addSet calls add order_index 1 and 2.
  expect(localSets).toHaveLength(3);
  // The two explicitly completed sets are completed; the auto-staged set is not.
  expect(localSets.filter((s) => s.completed === 1)).toHaveLength(2);

  const outbox = await db.getAllAsync<{ table_name: string; op: string; row_id: string }>(
    'SELECT table_name, op, row_id FROM outbox ORDER BY id ASC',
  );
  expect(outbox.length).toBeGreaterThan(0);

  setSyncState({ online: true });
  // Per-row ordering (#0) holds a row's update behind its still-queued insert,
  // so a full drain now spans multiple cycles. Drain until the outbox is empty,
  // exactly as the live engine does across repeated triggers.
  for (let i = 0; i < 5; i++) {
    await pushOutbox();
    const left = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
    if ((left?.c ?? 0) === 0) break;
  }

  // Inserts now go through upsert(by-id) for kill-mid-ack idempotency, so the
  // server sees an `upsert` op for any outbox `insert`. row_ids and order are
  // still preserved 1:1 (inserts ship first, then each row's later update).
  expect(serverLog.length).toBe(outbox.length);
  expect(serverLog.map((r) => r.row_id)).toEqual(outbox.map((r) => r.row_id));
  for (let i = 0; i < outbox.length; i++) {
    const expected = outbox[i]!.op === 'insert' ? 'upsert' : outbox[i]!.op;
    expect(serverLog[i]!.op).toBe(expected);
  }

  const remaining = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
  expect(remaining?.c).toBe(0);

  const finishStep = serverLog.find(
    (r) => r.table === 'workouts' && r.op === 'update' && r.row_id === workoutId,
  );
  expect(finishStep?.payload).toHaveProperty('ended_at');
});

test('push retries on failure and keeps row in outbox', async () => {
  const workoutId = await createWorkout({ userId: USER_ID, title: 'Flaky' });
  expect(workoutId).toBeTruthy();
  setSyncState({ online: true });

  // Make the server reject the upsert (which is what an outbox `insert` becomes
  // post-hardening) once with a non-transient error.
  const supa = (jest.requireMock('@/auth/supabase') as { supabase: { from: unknown } }).supabase;
  const originalFrom = supa.from;
  let failed = false;
  supa.from = (t: string) => {
    const chain = (originalFrom as (t: string) => Record<string, unknown>)(t);
    const realUpsert = chain.upsert as (p: Record<string, unknown>) => Promise<{ error: unknown }>;
    chain.upsert = (p: Record<string, unknown>) => {
      if (!failed) {
        failed = true;
        return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } });
      }
      return realUpsert(p);
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
  expect(stuck?.last_error).toContain('duplicate key');
});

test('non-transient errors quarantine the row after MAX_ATTEMPTS', async () => {
  await createWorkout({ userId: USER_ID, title: 'Doomed' });
  setSyncState({ online: true });

  const supa = (jest.requireMock('@/auth/supabase') as { supabase: { from: unknown } }).supabase;
  const originalFrom = supa.from;
  supa.from = (t: string) => {
    const chain = (originalFrom as (t: string) => Record<string, unknown>)(t);
    chain.upsert = () => Promise.resolve({ error: { message: 'check constraint failed' } });
    return chain;
  };

  // Drive five drains so attempts climbs to MAX_ATTEMPTS = 5.
  for (let i = 0; i < 6; i++) {
    await pushOutbox();
    // Reset next_attempt_at so the row is eligible again next loop iteration.
    const db = await getDb();
    await db.runAsync('UPDATE outbox SET next_attempt_at = NULL');
  }

  const db = await getDb();
  const row = await db.getFirstAsync<{ attempts: number }>(
    'SELECT attempts FROM outbox WHERE table_name = ?',
    ['workouts'],
  );
  expect(row?.attempts).toBeGreaterThanOrEqual(5);
});

test('401 (transient) does NOT increment attempts', async () => {
  await createWorkout({ userId: USER_ID, title: 'No session' });
  setSyncState({ online: true });

  const supa = (jest.requireMock('@/auth/supabase') as { supabase: { from: unknown } }).supabase;
  const originalFrom = supa.from;
  supa.from = (t: string) => {
    const chain = (originalFrom as (t: string) => Record<string, unknown>)(t);
    chain.upsert = () => Promise.resolve({ error: { status: 401, message: 'JWT expired' } });
    return chain;
  };

  await pushOutbox();

  const db = await getDb();
  const row = await db.getFirstAsync<{ attempts: number }>(
    'SELECT attempts FROM outbox WHERE table_name = ?',
    ['workouts'],
  );
  expect(row?.attempts).toBe(0);
});

test('cascade soft-delete tombstones children locally + in outbox', async () => {
  const exerciseId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?)`,
    [exerciseId, 'Squat', new Date().toISOString(), new Date().toISOString()],
  );

  const workoutId = await createWorkout({ userId: USER_ID, title: 'Leg day' });
  const weId = await addExerciseToWorkout({ workoutId, exerciseId });
  const setId = await addSet(weId, { weight: 100, reps: 5 });

  // Drop the workout — children must be tombstoned in the same transaction.
  await deleteWorkoutLocal(workoutId);

  const live = await db.getAllAsync<{ c: number }>(
    `SELECT
       (SELECT COUNT(*) FROM workouts WHERE id = ? AND deleted_at IS NULL) AS c
     UNION ALL
     SELECT (SELECT COUNT(*) FROM workout_exercises WHERE id = ? AND deleted_at IS NULL)
     UNION ALL
     SELECT (SELECT COUNT(*) FROM sets WHERE id = ? AND deleted_at IS NULL)`,
    [workoutId, weId, setId],
  );
  expect(live.map((r) => r.c)).toEqual([0, 0, 0]);

  // Outbox must contain delete rows for parent + every child.
  const deletes = await db.getAllAsync<{ table_name: string; row_id: string }>(
    `SELECT table_name, row_id FROM outbox WHERE op = 'delete' ORDER BY id`,
  );
  const tables = deletes.map((d) => d.table_name);
  expect(tables).toContain('workouts');
  expect(tables).toContain('workout_exercises');
  expect(tables).toContain('sets');
});
