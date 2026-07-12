import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getOutboxPreview } from '@/sync/outboxPreview';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

async function insertOutbox(args: {
  table: string;
  op: string;
  rowId: string;
  createdAt: string;
  attempts?: number;
}) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [args.table, args.op, args.rowId, '{}', args.createdAt, args.attempts ?? 0],
  );
}

test('returns empty when outbox is empty', async () => {
  expect(await getOutboxPreview()).toEqual([]);
});

test('returns up to default limit (5) most-recent entries by id DESC', async () => {
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    await insertOutbox({
      table: 'sets',
      op: 'update',
      rowId: `set-${i}`,
      createdAt: new Date(now - (7 - i) * 1000).toISOString(),
    });
  }
  const preview = await getOutboxPreview();
  expect(preview).toHaveLength(5);
  // most recent (latest id) first
  expect(preview[0]!.row_id).toBe('set-6');
  expect(preview[4]!.row_id).toBe('set-2');
});

test('respects custom limit', async () => {
  await insertOutbox({
    table: 'sets',
    op: 'update',
    rowId: 'a',
    createdAt: new Date().toISOString(),
  });
  await insertOutbox({
    table: 'sets',
    op: 'update',
    rowId: 'b',
    createdAt: new Date().toISOString(),
  });
  await insertOutbox({
    table: 'sets',
    op: 'update',
    rowId: 'c',
    createdAt: new Date().toISOString(),
  });
  expect(await getOutboxPreview(2)).toHaveLength(2);
});

test('excludes quarantined entries (attempts >= MAX_ATTEMPTS)', async () => {
  await insertOutbox({
    table: 'sets',
    op: 'update',
    rowId: 'a',
    createdAt: new Date().toISOString(),
    attempts: 5,
  });
  await insertOutbox({
    table: 'sets',
    op: 'update',
    rowId: 'b',
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  const preview = await getOutboxPreview();
  expect(preview).toHaveLength(1);
  expect(preview[0]!.row_id).toBe('b');
});
