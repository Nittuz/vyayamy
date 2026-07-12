/**
 * Incremental pull tests.
 *
 * Stubs the supabase client with a fluent select/or/order/limit builder that
 * returns a fixed set of paginated rows per table, then drives `pullOnce()`
 * and asserts the column-merge / cursor-advance / tombstone semantics.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { pullOnce } from '@/sync/pull';
import { setSyncState } from '@/sync/state';
import { uuidv4 } from '@/db/uuid';

interface ServerRow {
  id: string;
  [k: string]: unknown;
}

const tableData: Record<string, ServerRow[]> = {};

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => {
    let rows = (tableData[table] ?? []).slice();
    const chain = {
      select() {
        return this;
      },
      or(_predicate: string) {
        return this;
      },
      order(_col: string) {
        return this;
      },
      limit(n: number) {
        const out = rows.slice(0, n);
        rows = rows.slice(n); // simulate pagination across calls
        return Promise.resolve({ data: out, error: null });
      },
    };
    return chain;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

const USER_ID = 'pull-test-user';

beforeEach(async () => {
  for (const k of Object.keys(tableData)) delete tableData[k];
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
});

test('pull merges fresh rows and advances cursor', async () => {
  const exId = uuidv4();
  tableData['exercises'] = [
    {
      id: exId,
      name: 'Deadlift',
      muscle_group: 'Back',
      user_id: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await pullOnce();

  const db = await getDb();
  const local = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM exercises WHERE id = ?',
    [exId],
  );
  expect(local?.name).toBe('Deadlift');

  const meta = await db.getFirstAsync<{ last_pulled_at: string }>(
    'SELECT last_pulled_at FROM sync_meta WHERE table_name = ?',
    ['exercises'],
  );
  expect(meta?.last_pulled_at).toBe('2026-05-01T00:00:00.000Z');
});

test('pull preserves columns mentioned in pending outbox update (column-merge)', async () => {
  // 1. Seed a local row.
  const setId = uuidv4();
  const weId = uuidv4();
  const wId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      wId,
      USER_ID,
      '2026-01-01T00:00:00.000Z',
      'W',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ],
  );
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    [weId, wId, 'ex1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, created_at, updated_at)
       VALUES (?, ?, 0, 100, 5, 0, ?, ?)`,
    [setId, weId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );

  // 2. Pending outbox update mutates only `weight` locally.
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
    ['sets', 'update', setId, JSON.stringify({ id: setId, weight: 110 })],
  );
  await db.runAsync('UPDATE sets SET weight = 110 WHERE id = ?', [setId]);

  // 3. Server has a newer version where ANOTHER device bumped `reps` to 8.
  tableData['sets'] = [
    {
      id: setId,
      workout_exercise_id: weId,
      order_index: 0,
      weight: 95, // server's stale weight
      reps: 8, // server's new reps from another device
      completed: 0,
      completed_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await pullOnce();

  const merged = await db.getFirstAsync<{ weight: number; reps: number }>(
    'SELECT weight, reps FROM sets WHERE id = ?',
    [setId],
  );
  // Local weight (110) survives because the outbox patch named that column.
  expect(merged?.weight).toBe(110);
  // Server reps (8) lands locally because no outbox row touched it.
  expect(merged?.reps).toBe(8);
});

test('pull skips entirely when outbox has insert/upsert/delete pending', async () => {
  const setId = uuidv4();
  const weId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at)
       VALUES (?, 'w1', 'ex1', 0, ?, ?)`,
    [weId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, created_at, updated_at)
       VALUES (?, ?, 0, 50, 5, 0, ?, ?)`,
    [setId, weId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  // Pending insert (full ownership)
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, 'insert', ?, ?)`,
    ['sets', setId, JSON.stringify({ id: setId, weight: 50, reps: 5 })],
  );

  tableData['sets'] = [
    {
      id: setId,
      workout_exercise_id: weId,
      order_index: 0,
      weight: 999, // would obliterate local if not skipped
      reps: 1,
      completed: 1,
      completed_at: '2026-05-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await pullOnce();

  const local = await db.getFirstAsync<{ weight: number; reps: number; completed: number }>(
    'SELECT weight, reps, completed FROM sets WHERE id = ?',
    [setId],
  );
  expect(local?.weight).toBe(50);
  expect(local?.reps).toBe(5);
  expect(local?.completed).toBe(0);
});

test('tombstones propagate (deleted_at lands locally)', async () => {
  const exId = uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at)
       VALUES (?, 'Old', NULL, ?, ?)`,
    [exId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );

  tableData['exercises'] = [
    {
      id: exId,
      name: 'Old',
      muscle_group: null,
      user_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: '2026-05-01T00:00:00.000Z',
    },
  ];

  await pullOnce();

  const local = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM exercises WHERE id = ?',
    [exId],
  );
  expect(local?.deleted_at).toBe('2026-05-01T00:00:00.000Z');
});
