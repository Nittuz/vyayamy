/**
 * Verifies that when a personal_records upsert is sent and the server
 * returns a row with a different id (because another device already
 * created a row with the same composite key), the local row's id is
 * updated to match the server's id.
 *
 * This prevents the post-pull duplicate that the audit flagged: without
 * reconciliation, the local row keeps the client-side UUID and the next
 * pull lands a "new" row with the server id, creating two locally-
 * visible PRs for one composite key.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { __setPushSleepForTests, pushOutbox } from '@/sync/push';
import { setSyncState } from '@/sync/state';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const SERVER_ID = '99999999-9999-9999-9999-999999999999';

jest.mock('@/auth/supabase', () => {
  const SERVER_RESPONSE_ID = '99999999-9999-9999-9999-999999999999';
  const upsertResponses: Array<{ id: string }> = [{ id: SERVER_RESPONSE_ID }];
  const builder = (table: string) => {
    const chain = {
      _table: table,
      upsert(_p: Record<string, unknown>, _opts?: { onConflict?: string }) {
        const next = upsertResponses.shift() ?? { id: 'fallback' };
        return {
          select: () => ({
            single: () => Promise.resolve({ data: next, error: null }),
          }),
          // Fallback: old call shape (no select chain)
          then: (cb: (v: { error: null }) => void) => Promise.resolve(cb({ error: null })),
        };
      },
    };
    return chain;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
  __setPushSleepForTests(() => Promise.resolve());
});

afterAll(() => {
  __setPushSleepForTests(null);
});

test('PR upsert response reconciles local id to server id', async () => {
  const db = await getDb();
  // Seed a personal_record locally with a client-side UUID
  await db.runAsync(
    `INSERT INTO personal_records (id, user_id, exercise_id, type, value, achieved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      CLIENT_ID,
      'u1',
      'ex1',
      'heaviest',
      JSON.stringify({ weight: 185, reps: 5 }),
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    ],
  );
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
    [
      'personal_records',
      'upsert',
      CLIENT_ID,
      JSON.stringify({
        id: CLIENT_ID,
        user_id: 'u1',
        exercise_id: 'ex1',
        type: 'heaviest',
        value: { weight: 185, reps: 5 },
        achieved_at: '2026-05-01T00:00:00.000Z',
      }),
    ],
  );

  await pushOutbox();

  // Outbox is drained
  const outbox = await db.getAllAsync('SELECT id FROM outbox');
  expect(outbox).toHaveLength(0);

  // Local row id is now the server's id, not the client's
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM personal_records');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(SERVER_ID);
});
