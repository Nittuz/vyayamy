/**
 * Incremental pull.
 *
 * For each synced table, fetch rows where (updated_at, id) is past the
 * cursor, then column-merge into local SQLite. Deleted rows
 * (deleted_at IS NOT NULL) come through too so tombstones propagate.
 *
 * Conflict resolution with pending local writes
 * ---------------------------------------------
 * If the user has a pending mutation for the row in the outbox, the local
 * row's view of the columns the user touched must win. We resolve at the
 * column level:
 *
 *   - Pending insert / upsert / delete: skip the row entirely. The local
 *     state is authoritative until the outbox drains.
 *   - Pending update: union the column keys mentioned in every pending
 *     update for this row. Write only the *other* columns from the server
 *     pull. The user's in-flight edits are preserved; unmodified columns
 *     touched by another device land locally.
 *
 * This avoids the prior bug where the entire server row was discarded if
 * any outbox entry existed for the row, silently dropping unrelated column
 * updates made on another device.
 */
import * as Sentry from '@sentry/react-native';

import { supabase } from '@/auth/supabase';
import { getDb } from '@/db/client';
import { SYNCED_TABLES, type SyncedTable } from '@/db/schema';
import { withTransaction } from '@/db/transaction';

import { setSyncState } from './state';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(err);
}

type AnyTable = ReturnType<typeof supabase.from>;
function fromDynamic(table: string): AnyTable {
  return (supabase as unknown as { from: (t: string) => AnyTable }).from(table);
}

const PAGE_SIZE = 500;
const EPOCH = '1970-01-01T00:00:00.000Z';
// Re-scan a small window below the stored cursor each pull so a row whose
// updated_at landed just under it (clock skew / out-of-order commit) is not
// permanently skipped. The merge is an idempotent upsert, so re-seeing rows is
// harmless (#8, ADR-0004's monotonicity caveat).
const CURSOR_OVERLAP_MS = 5_000;
// Sentinel less than any real UUID. Used on the first page when sync_meta
// has no last_pulled_id yet; sending an empty string trips PostgREST UUID parsing.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface OutboxPending {
  op: 'insert' | 'update' | 'upsert' | 'delete';
  payload_json: string;
}

export async function pullOnce(): Promise<void> {
  const db = await getDb();
  setSyncState({ pullInFlight: true });
  try {
    // Per-table fault isolation: one table's failure must not starve the rest
    // (#2). Record the first error for the UI and report each to Sentry.
    let firstError: string | null = null;
    for (const table of SYNCED_TABLES) {
      try {
        await pullTable(table);
      } catch (err) {
        if (firstError === null) firstError = errorMessage(err);
        Sentry.captureException(err, { tags: { pull_table: table } });
      }
    }
    setSyncState({ lastPulledAt: new Date().toISOString(), lastError: firstError });
  } finally {
    setSyncState({ pullInFlight: false });
  }

  async function pullTable(table: SyncedTable): Promise<void> {
    const meta = await db.getFirstAsync<{ last_pulled_at: string | null; last_pulled_id: string | null }>(
      'SELECT last_pulled_at, last_pulled_id FROM sync_meta WHERE table_name = ?',
      [table],
    );
    let cursorTs = meta?.last_pulled_at ?? EPOCH;
    let cursorId = meta?.last_pulled_id ?? ZERO_UUID;
    // Rewind the READ cursor by the overlap (the stored cursor still advances to
    // the true last row below). Reset the id tiebreaker so the whole window is
    // rescanned, not continued from the last id (#8).
    if (meta?.last_pulled_at) {
      const rewound = new Date(new Date(meta.last_pulled_at).getTime() - CURSOR_OVERLAP_MS);
      if (!Number.isNaN(rewound.getTime())) {
        cursorTs = rewound.toISOString();
        cursorId = ZERO_UUID;
      }
    }

    while (true) {
      const { data, error } = await fromDynamic(table)
        .select('*')
        .or(`updated_at.gt.${cursorTs},and(updated_at.eq.${cursorTs},id.gt.${cursorId})`)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      if (!data || data.length === 0) break;

      const ids = (data as Record<string, unknown>[]).map((r) => String(r.id));

      await withTransaction(db, async () => {
        // Snapshot pending outbox entries INSIDE the transaction so a local edit
        // committed between fetch and merge can't be clobbered — enqueueMutation
        // serializes through the same mutex, so this read and the merge are
        // atomic with respect to it (#4).
        const pendingByRowId = await fetchPendingOutbox(table, ids);
        for (const row of data) {
          const r = row as Record<string, unknown>;
          const rowId = String(r.id);
          try {
            const pending = pendingByRowId.get(rowId);

            // Pending insert/upsert/delete → local is authoritative until it drains.
            if (
              pending?.some(
                (p) => p.op === 'insert' || p.op === 'upsert' || p.op === 'delete',
              )
            ) {
              continue;
            }

            // Pending updates → keep local columns named in any patch; merge the rest.
            const protectedCols = new Set<string>();
            if (pending) {
              for (const p of pending) {
                if (p.op !== 'update') continue;
                const payload = safeParsePayload(p.payload_json);
                for (const k of Object.keys(payload)) {
                  if (k !== 'id') protectedCols.add(k);
                }
              }
            }

            const cols = Object.keys(r).filter((c) => !protectedCols.has(c));
            if (cols.length === 0) continue;
            // Always include id so ON CONFLICT(id) has its match column.
            if (!cols.includes('id')) cols.unshift('id');

            const placeholders = cols.map(() => '?').join(', ');
            const updateAssign = cols
              .filter((c) => c !== 'id')
              .map((c) => `${c} = excluded.${c}`)
              .join(', ');
            const values = cols.map((c) => normalize(r[c]));

            if (updateAssign.length === 0) {
              // Only id survived after column-protection — nothing to do.
              continue;
            }
            await db.runAsync(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
                 ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
              values,
            );
          } catch (rowErr) {
            // Per-row isolation: a single un-mergeable row (schema drift, an
            // unexpected constraint) must not roll back the page or wedge the
            // cursor (#2). Skip it, report, and let the cursor advance past it.
            Sentry.captureException(rowErr, {
              tags: { pull_table: table, pull_row: rowId },
            });
          }
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

  async function fetchPendingOutbox(
    table: SyncedTable,
    rowIds: string[],
  ): Promise<Map<string, OutboxPending[]>> {
    const out = new Map<string, OutboxPending[]>();
    if (rowIds.length === 0) return out;
    // Split into chunks to keep SQLite happy on very large pages.
    const CHUNK = 200;
    for (let i = 0; i < rowIds.length; i += CHUNK) {
      const slice = rowIds.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const rows = await db.getAllAsync<{
        row_id: string;
        op: OutboxPending['op'];
        payload_json: string;
      }>(
        `SELECT row_id, op, payload_json FROM outbox
           WHERE table_name = ? AND row_id IN (${placeholders})`,
        [table, ...slice],
      );
      for (const row of rows) {
        const arr = out.get(row.row_id) ?? [];
        arr.push({ op: row.op, payload_json: row.payload_json });
        out.set(row.row_id, arr);
      }
    }
    return out;
  }

  function safeParsePayload(s: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
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
