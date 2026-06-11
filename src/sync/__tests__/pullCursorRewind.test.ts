/**
 * Regression guard for deep-review #8:
 *   "Pull cursor can permanently skip rows committed out of timestamp order."
 *
 * Each pull rewinds its (updated_at) cursor by a small overlap and rescans from
 * the start of that window, so a row whose updated_at lands just under the last
 * cursor (clock skew, or a write committed slightly out of order) is re-seen.
 * The local merge is an idempotent upsert, so re-processing is harmless.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { pullOnce } from '@/sync/pull';
import { setSyncState } from '@/sync/state';

const capturedPredicates: Record<string, string[]> = {};

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => ({
    select() {
      return this;
    },
    or(predicate: string) {
      (capturedPredicates[table] ??= []).push(predicate);
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  });
  return { supabase: { from: (t: string) => builder(t) } };
});

beforeEach(async () => {
  for (const k of Object.keys(capturedPredicates)) delete capturedPredicates[k];
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
});

test('pull rewinds the stored cursor by an overlap and rescans from the window start (#8)', async () => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (table_name, last_pulled_at, last_pulled_id)
       VALUES ('exercises', '2026-05-01T00:00:10.000Z', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')`,
  );

  await pullOnce();

  const preds = capturedPredicates['exercises'] ?? [];
  expect(preds.length).toBeGreaterThan(0);
  // 5s earlier than the stored cursor...
  expect(preds[0]).toContain('2026-05-01T00:00:05.000Z');
  // ...and rescanning the whole window (zero-uuid), not continuing from the id.
  expect(preds[0]).toContain('00000000-0000-0000-0000-000000000000');
  expect(preds[0]).not.toContain('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});
