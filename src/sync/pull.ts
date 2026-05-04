/**
 * Incremental pull — Phase 2 implementation.
 *
 * For each synced table, fetch rows where updated_at > last_pulled_at,
 * upsert into local SQLite, then advance the checkpoint. Deleted rows
 * (deleted_at IS NOT NULL) are pulled too so tombstones propagate.
 */
import { supabase } from '@/auth/supabase';
import { getDb } from '@/db/client';
import { SYNCED_TABLES, type SyncedTable } from '@/db/schema';

import { setSyncState } from './state';

type AnyTable = ReturnType<typeof supabase.from>;
function fromDynamic(table: string): AnyTable {
  return (supabase as unknown as { from: (t: string) => AnyTable }).from(table);
}

const PAGE_SIZE = 500;
const EPOCH = '1970-01-01T00:00:00.000Z';

export async function pullOnce(): Promise<void> {
  const db = await getDb();
  setSyncState({ pullInFlight: true });
  try {
    for (const table of SYNCED_TABLES) {
      await pullTable(table);
    }
    setSyncState({ lastPulledAt: new Date().toISOString() });
  } finally {
    setSyncState({ pullInFlight: false });
  }

  async function pullTable(table: SyncedTable): Promise<void> {
    const meta = await db.getFirstAsync<{ last_pulled_at: string | null; last_pulled_id: string | null }>(
      'SELECT last_pulled_at, last_pulled_id FROM sync_meta WHERE table_name = ?',
      [table],
    );
    let cursorTs = meta?.last_pulled_at ?? EPOCH;
    let cursorId = meta?.last_pulled_id ?? '';

    while (true) {
      const { data, error } = await fromDynamic(table)
        .select('*')
        .or(`updated_at.gt.${cursorTs},and(updated_at.eq.${cursorTs},id.gt.${cursorId})`)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      if (!data || data.length === 0) break;

      await db.withTransactionAsync(async () => {
        for (const row of data) {
          const r = row as Record<string, unknown>;
          const pendingLocal = await db.getFirstAsync<{ c: number }>(
            'SELECT COUNT(*) AS c FROM outbox WHERE table_name = ? AND row_id = ?',
            [table, String(r.id)],
          );
          if ((pendingLocal?.c ?? 0) > 0) continue;

          const columns = Object.keys(r);
          const placeholders = columns.map(() => '?').join(', ');
          const updateAssign = columns
            .filter((c) => c !== 'id')
            .map((c) => `${c} = excluded.${c}`)
            .join(', ');
          const values = columns.map((c) => normalize(r[c]));

          await db.runAsync(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
            values,
          );
        }
      });

      const last = data[data.length - 1] as Record<string, unknown> | undefined;
      const nextTs = (last?.updated_at as string | undefined) ?? cursorTs;
      const nextId = (last?.id as string | undefined) ?? cursorId;
      await db.runAsync(
        `INSERT INTO sync_meta (table_name, last_pulled_at, last_pulled_id) VALUES (?, ?, ?)
           ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at, last_pulled_id = excluded.last_pulled_id`,
        [table, nextTs, nextId],
      );
      cursorTs = nextTs;
      cursorId = nextId;

      if (data.length < PAGE_SIZE) break;
    }
  }


  function normalize(v: unknown): string | number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }
}
