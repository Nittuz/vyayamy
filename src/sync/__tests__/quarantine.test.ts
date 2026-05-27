import { getDb, initDb, resetDbForTests } from '@/db/client';
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
    [
      args.table,
      args.op,
      args.rowId,
      JSON.stringify(args.payload),
      args.createdAt,
      args.attempts,
    ],
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
  const before = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
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
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ?',
    ['set-1'],
  );
  await discardQuarantinedRow(row!.id);
  const after = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ?', ['set-1']);
  expect(after).toHaveLength(0);
});

test('STALE_THRESHOLD_MS is 24 hours', () => {
  expect(STALE_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
});
