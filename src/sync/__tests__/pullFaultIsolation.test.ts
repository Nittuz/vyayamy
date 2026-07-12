/**
 * Regression guard for deep-review #2:
 *   "Pull has zero fault isolation: one bad row wedges that table's cursor
 *    forever AND aborts all later tables."
 *
 * (1) A table whose fetch errors must not abort the rest of the pull. (2) A
 * single un-mergeable row (e.g. schema drift → an unknown column) must not roll
 * back the whole page or freeze the cursor; the good rows still land and the
 * cursor advances past the poison.
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
const tableErrors: Record<string, boolean> = {};

jest.mock('@/auth/supabase', () => {
  const builder = (table: string) => {
    let rows = (tableData[table] ?? []).slice();
    return {
      select() {
        return this;
      },
      or() {
        return this;
      },
      order() {
        return this;
      },
      limit(n: number) {
        if (tableErrors[table]) {
          return Promise.resolve({ data: null, error: { message: 'table fetch boom', status: 500 } });
        }
        const out = rows.slice(0, n);
        rows = rows.slice(n);
        return Promise.resolve({ data: out, error: null });
      },
    };
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

beforeEach(async () => {
  for (const k of Object.keys(tableData)) delete tableData[k];
  for (const k of Object.keys(tableErrors)) delete tableErrors[k];
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
});

test('a table that errors does not abort pulls of later tables (#2)', async () => {
  tableErrors['exercises'] = true; // early in SYNCED_TABLES
  const tplId = uuidv4();
  tableData['templates'] = [
    {
      id: tplId,
      user_id: 'u1',
      name: 'Push Day',
      exercise_order: '[]',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await expect(pullOnce()).resolves.toBeUndefined(); // does not throw

  const db = await getDb();
  const tpl = await db.getFirstAsync<{ name: string }>('SELECT name FROM templates WHERE id = ?', [tplId]);
  expect(tpl?.name).toBe('Push Day'); // later table still pulled
});

test('a single un-mergeable row does not wedge the page or the cursor (#2)', async () => {
  const goodId = uuidv4();
  const poisonId = uuidv4();
  tableData['exercises'] = [
    {
      id: goodId,
      name: 'Deadlift',
      muscle_group: 'Back',
      user_id: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      deleted_at: null,
    },
    {
      id: poisonId,
      // NOT NULL constraint violation — genuinely un-mergeable. (An unknown
      // extra column no longer poisons a row: pull intersects against the
      // local schema since #56, see pullSchemaDrift.test.ts.)
      name: null,
      user_id: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await pullOnce();

  const db = await getDb();
  const good = await db.getFirstAsync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', [goodId]);
  expect(good?.name).toBe('Deadlift'); // good row merged despite the poison sibling

  const meta = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    'SELECT last_pulled_at FROM sync_meta WHERE table_name = ?',
    ['exercises'],
  );
  // Cursor advanced past the page (to the last row's updated_at), not wedged.
  expect(meta?.last_pulled_at).toBe('2026-05-02T00:00:00.000Z');
});
