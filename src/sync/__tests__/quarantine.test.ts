import { getDb, initDb, resetDbForTests } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, listSetsForWorkoutExercise } from '@/queries/sets';
import { createWorkout } from '@/queries/workouts';
import {
  STALE_THRESHOLD_MS,
  discardQuarantinedRow,
  getQuarantined,
  retryQuarantinedRow,
} from '@/sync/quarantine';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['ex', 'Test Exercise', 'Test', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

async function insertStuckRow(args: {
  table: string;
  op: string;
  rowId: string;
  payload: object;
  createdAt: string;
  attempts: number;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [args.table, args.op, args.rowId, JSON.stringify(args.payload), args.createdAt, args.attempts],
  );
}

test('getQuarantined returns only rows with attempts >= MAX_ATTEMPTS', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: { weight: 185 },
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    attempts: 5,
  });
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-2',
    payload: { weight: 100 },
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    attempts: 3,
  });
  const rows = await getQuarantined();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.row_id).toBe('set-1');
});

test('retryQuarantinedRow resets attempts to 0 and clears next_attempt_at', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 5,
  });
  const db = await getDb();
  const before = await db.getFirstAsync<{ id: number }>('SELECT id FROM outbox WHERE row_id = ?', [
    'set-1',
  ]);
  await retryQuarantinedRow(before!.id);
  const after = await db.getFirstAsync<{ attempts: number; next_attempt_at: string | null }>(
    'SELECT attempts, next_attempt_at FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
  expect(after!.attempts).toBe(0);
  expect(after!.next_attempt_at).toBeNull();
});

test('discardQuarantinedRow removes the outbox row entirely', async () => {
  await insertStuckRow({
    table: 'sets',
    op: 'update',
    rowId: 'set-1',
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 5,
  });
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM outbox WHERE row_id = ?', [
    'set-1',
  ]);
  await discardQuarantinedRow(row!.id);
  const after = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ?', ['set-1']);
  expect(after).toHaveLength(0);
});

test('STALE_THRESHOLD_MS is 24 hours', () => {
  expect(STALE_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
});

test('discardQuarantinedRow with op=insert DELETEs the local row', async () => {
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const { weId } = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  // Auto-stage already added one set; add another we'll quarantine
  const setId = await addSet(weId, { weight: 100, reps: 5 });

  // Find that set's outbox row and quarantine it
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = 5 WHERE row_id = ? AND op = ?', [
    setId,
    'insert',
  ]);
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'insert'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox entry is gone
  const outbox = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ?', [setId]);
  expect(outbox).toHaveLength(0);
  // Local row is also gone (was an insert; revert = delete)
  const sets = await listSetsForWorkoutExercise(weId);
  expect(sets.map((s) => s.id)).not.toContain(setId);
});

test('discardQuarantinedRow with op=delete UN-TOMBSTONES the local row', async () => {
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const { weId } = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  // Get auto-staged set
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  // Tombstone via mutation
  const db = await getDb();
  await db.runAsync('UPDATE sets SET deleted_at = ? WHERE id = ?', [
    new Date().toISOString(),
    setId,
  ]);
  // Manually insert a quarantined delete outbox row (simulating push failure)
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    ['sets', 'delete', setId, '{}', new Date().toISOString(), 5],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'delete'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox row gone; local row un-tombstoned
  const visible = await listSetsForWorkoutExercise(weId);
  expect(visible.map((s) => s.id)).toContain(setId);
});

test('discardQuarantinedRow with op=update leaves the local row alone', async () => {
  // Update is the "user's edit stays local, just not synced" case.
  // We don't revert local edits — that would be surprising.
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const { weId } = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  // Apply a local update and quarantine the outbox row for it
  const db = await getDb();
  await db.runAsync('UPDATE sets SET weight = ?, reps = ? WHERE id = ?', [200, 10, setId]);
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [
      'sets',
      'update',
      setId,
      JSON.stringify({ weight: 200, reps: 10 }),
      new Date().toISOString(),
      5,
    ],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'update'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox row gone; local edit preserved
  const outbox = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ? AND op = ?', [
    setId,
    'update',
  ]);
  expect(outbox).toHaveLength(0);
  const afterSet = await db.getFirstAsync<{ weight: number; reps: number }>(
    'SELECT weight, reps FROM sets WHERE id = ?',
    [setId],
  );
  expect(afterSet!.weight).toBe(200);
  expect(afterSet!.reps).toBe(10);
});
