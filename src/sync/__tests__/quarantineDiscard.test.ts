/**
 * Regression guard for deep-review #6:
 *   "Quarantine discard is non-cascading: orphaned local children, orphaned
 *    outbox ops."
 *
 * Discarding a quarantined insert must remove the local row AND its FK children,
 * plus EVERY outbox op for those rows — otherwise a sibling update or a child
 * insert is left pointing at a row that no longer exists.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { MAX_ATTEMPTS } from '@/sync/push';
import { discardQuarantinedRow } from '@/sync/quarantine';

jest.mock('@/auth/supabase', () => ({
  supabase: {
    from: () => ({}),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

async function quarantineOutbox(table: string, op: string, rowId: string): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json, attempts) VALUES (?, ?, ?, ?, ?)`,
    [table, op, rowId, JSON.stringify({ id: rowId }), MAX_ATTEMPTS],
  );
  return r.lastInsertRowId;
}

async function pendingOutbox(table: string, op: string, rowId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json, attempts) VALUES (?, ?, ?, ?, 0)`,
    [table, op, rowId, JSON.stringify({ id: rowId })],
  );
}

const count = async (sql: string): Promise<number> =>
  (await (await getDb()).getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${sql}`))?.c ?? -1;

test('discarding a quarantined insert cascades to children and all their outbox ops (#6)', async () => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES ('w1','u',?,'W',?,?)`,
    [T, T, T],
  );
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES ('we1','w1','ex',0,?,?)`,
    [T, T],
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, completed, created_at, updated_at) VALUES ('s1','we1',0,0,?,?)`,
    [T, T],
  );

  const qid = await quarantineOutbox('workouts', 'insert', 'w1'); // discard target
  await pendingOutbox('workouts', 'update', 'w1'); // sibling op for the same row
  await pendingOutbox('workout_exercises', 'insert', 'we1'); // child op
  await pendingOutbox('sets', 'insert', 's1'); // grandchild op

  await discardQuarantinedRow(qid);

  // Local row + FK children are all gone.
  expect(await count(`workouts WHERE id='w1'`)).toBe(0);
  expect(await count(`workout_exercises WHERE id='we1'`)).toBe(0);
  expect(await count(`sets WHERE id='s1'`)).toBe(0);
  // No orphaned outbox ops survive for the discarded row or its children.
  expect(await count('outbox')).toBe(0);
});
