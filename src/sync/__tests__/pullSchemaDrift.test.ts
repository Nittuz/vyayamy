/**
 * Regression guard for deep-review #56 (silent permanent data loss):
 *   An ADDITIVE server column unknown to the local SQLite schema made every
 *   row's INSERT throw; per-row isolation then skipped the row while the
 *   cursor advanced past it — the row never landed locally and never would
 *   again until its updated_at changed server-side.
 *
 * Fix under test: pull intersects server row keys with the local table's
 * actual columns (PRAGMA table_info) before building the INSERT, so known
 * columns apply and unknown ones are ignored.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { pullOnce } from '@/sync/pull';
import { setSyncState } from '@/sync/state';

interface ServerRow {
  id: string;
  [k: string]: unknown;
}
const tableData: Record<string, ServerRow[]> = {};

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
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
});

test('a server row carrying an unknown (additive) column still applies its known columns (#56)', async () => {
  const rowId = uuidv4();
  tableData['exercises'] = [
    {
      id: rowId,
      name: 'Front Squat',
      muscle_group: 'Legs',
      user_id: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted_at: null,
      // Column added server-side by a newer app version; this build's local
      // schema has never heard of it.
      coach_cue: 'elbows high',
    },
  ];

  await pullOnce();

  const db = await getDb();
  const row = await db.getFirstAsync<{ name: string; muscle_group: string }>(
    'SELECT name, muscle_group FROM exercises WHERE id = ?',
    [rowId],
  );
  // The row LANDED (previously: skipped forever) with every known column intact.
  expect(row?.name).toBe('Front Squat');
  expect(row?.muscle_group).toBe('Legs');
});

test('every row of a page with an additive column lands, and the cursor advance is not a loss (#56)', async () => {
  const idA = uuidv4();
  const idB = uuidv4();
  tableData['templates'] = [
    {
      id: idA,
      user_id: 'u1',
      name: 'Push Day',
      exercise_order: '[]',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted_at: null,
      color_tag: 'ember', // additive drift on EVERY row of the page
    },
    {
      id: idB,
      user_id: 'u1',
      name: 'Pull Day',
      exercise_order: '[]',
      created_at: '2026-06-02T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
      deleted_at: null,
      color_tag: 'iron',
    },
  ];

  await pullOnce();

  const db = await getDb();
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM templates');
  expect(count?.c).toBe(2); // previously: 0 rows, cursor at 2026-06-02 → both lost for good

  const meta = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    'SELECT last_pulled_at FROM sync_meta WHERE table_name = ?',
    ['templates'],
  );
  expect(meta?.last_pulled_at).toBe('2026-06-02T00:00:00.000Z');
});

test('a server row missing an optional local column still applies', async () => {
  const rowId = uuidv4();
  tableData['exercises'] = [
    {
      id: rowId,
      name: 'Plank',
      // muscle_group intentionally absent from the server payload.
      user_id: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  await pullOnce();

  const db = await getDb();
  const row = await db.getFirstAsync<{ name: string; muscle_group: string | null }>(
    'SELECT name, muscle_group FROM exercises WHERE id = ?',
    [rowId],
  );
  expect(row?.name).toBe('Plank');
  expect(row?.muscle_group).toBeNull();
});
