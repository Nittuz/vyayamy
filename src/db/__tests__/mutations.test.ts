/**
 * Cascade capture + restore primitives (undo spec §1). enqueueMutation's
 * delete branch must return every tombstoned {table,id} pair — parent first,
 * then cascade walk order — so a caller can restore exactly those rows
 * later. Capture at cascade time is the ONLY correct source of membership:
 * cascadeSoftDelete only ever visits `deleted_at IS NULL` rows, so a row
 * already dead before this delete never enters the capture and restoreRows
 * can never resurrect it.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { enqueueMutation, restoreRows } from '@/db/mutations';

jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));

const T = '2026-01-01T00:00:00.000Z';

/** workout `w` -> [we1, we2] -> we1 has sets [s1, s2], we2 has [s3]. */
async function seedWorkoutTree() {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['w', 'u', T, 'Push', T, T],
  );
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['we1', 'w', 'ex', 0, T, T],
  );
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['we2', 'w', 'ex', 1, T, T],
  );
  await db.runAsync(
    'INSERT INTO sets (id, workout_exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['s1', 'we1', 0, T, T],
  );
  await db.runAsync(
    'INSERT INTO sets (id, workout_exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['s2', 'we1', 1, T, T],
  );
  await db.runAsync(
    'INSERT INTO sets (id, workout_exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['s3', 'we2', 0, T, T],
  );
}

async function deletedAt(table: string, id: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM ${table} WHERE id = ?`,
    [id],
  );
  return row!.deleted_at;
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

describe('enqueueMutation delete cascade — capture', () => {
  test('captures workout + live exercises + live sets, excluding a set already tombstoned', async () => {
    await seedWorkoutTree();
    const db = await getDb();
    // s3 was soft-deleted BEFORE the workout delete — cascadeSoftDelete's
    // `deleted_at IS NULL` filter means it's never visited, so it must not
    // appear in the capture.
    await db.runAsync('UPDATE sets SET deleted_at = ? WHERE id = ?', [T, 's3']);

    const rows = await enqueueMutation({ table: 'workouts', op: 'delete', rowId: 'w' });

    // parent first
    expect(rows[0]).toEqual({ table: 'workouts', id: 'w' });

    const byTable = (t: string) =>
      rows
        .filter((r) => r.table === t)
        .map((r) => r.id)
        .sort();
    expect(byTable('workouts')).toEqual(['w']);
    expect(byTable('workout_exercises')).toEqual(['we1', 'we2']);
    expect(byTable('sets')).toEqual(['s1', 's2']);
    expect(rows.some((r) => r.id === 's3')).toBe(false);
    expect(rows).toHaveLength(5);
  });

  test('a non-delete op captures nothing', async () => {
    await seedWorkoutTree();
    const rows = await enqueueMutation({
      table: 'workouts',
      op: 'update',
      rowId: 'w',
      payload: { title: 'Renamed' },
    });
    expect(rows).toEqual([]);
  });
});

describe('restoreRows', () => {
  test('clears deleted_at on exactly the captured rows, leaves a pre-tombstoned row dead, and enqueues the restore-update outbox row AFTER the delete row for the same row_id', async () => {
    await seedWorkoutTree();
    const db = await getDb();
    await db.runAsync('UPDATE sets SET deleted_at = ? WHERE id = ?', [T, 's3']);

    const rows = await enqueueMutation({ table: 'workouts', op: 'delete', rowId: 'w' });
    await restoreRows(rows);

    // (a) exactly the captured rows are alive again; the pre-tombstoned set
    // stays dead (membership came from capture, not from re-deriving it).
    expect(await deletedAt('workouts', 'w')).toBeNull();
    expect(await deletedAt('workout_exercises', 'we1')).toBeNull();
    expect(await deletedAt('workout_exercises', 'we2')).toBeNull();
    expect(await deletedAt('sets', 's1')).toBeNull();
    expect(await deletedAt('sets', 's2')).toBeNull();
    expect(await deletedAt('sets', 's3')).not.toBeNull();

    // (b) per row_id, the outbox's delete row precedes its restore-update
    // row — the outbox drains per-row FIFO, so this ordering is what lets
    // the restore win on the server instead of racing the original delete.
    for (const row of rows) {
      const ops = await db.getAllAsync<{ op: string }>(
        'SELECT op FROM outbox WHERE row_id = ? ORDER BY id ASC',
        [row.id],
      );
      const opList = ops.map((o) => o.op);
      expect(opList).toEqual(['delete', 'update']);
    }
  });
});
