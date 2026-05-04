/**
 * Local-first mutation primitive.
 *
 * Every user action that touches data calls enqueueMutation(). It:
 *   1. Applies the write to SQLite immediately.
 *   2. Appends an outbox row describing the server-side effect.
 * Both happen in a single SQLite transaction, so the UI never observes
 * a state where the local row exists but the sync intent does not.
 *
 * The push engine picks up outbox rows asynchronously and drains them
 * against Supabase. Failures stay in the outbox and are retried; the
 * UI stays responsive regardless.
 */
import { getDb } from './client';
import type { SyncedTable } from './schema';
import { nowIso } from './uuid';

export type MutationOp = 'insert' | 'update' | 'upsert' | 'delete';

interface EnqueueArgs {
  table: SyncedTable;
  op: MutationOp;
  rowId: string;
  /** Full row for insert/upsert; diff for update; ignored for delete. */
  payload?: Record<string, unknown>;
}

export async function enqueueMutation(args: EnqueueArgs): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    if (args.op === 'delete') {
      await db.runAsync(
        `UPDATE ${args.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, args.rowId],
      );
    } else if (args.op === 'insert' || args.op === 'upsert') {
      const payload: Record<string, unknown> = {
        id: args.rowId,
        updated_at: now,
        ...(args.payload ?? {}),
      };
      const cols = Object.keys(payload);
      const placeholders = cols.map(() => '?').join(', ');
      const updateAssign = cols
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');
      const values = cols.map((c) => toSqlite(payload[c]));
      await db.runAsync(
        `INSERT INTO ${args.table} (${cols.join(', ')}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${updateAssign}`,
        values,
      );
    } else {
      const patch: Record<string, unknown> = { ...(args.payload ?? {}), updated_at: now };
      const cols = Object.keys(patch);
      if (cols.length === 0) return;
      const assign = cols.map((c) => `${c} = ?`).join(', ');
      const values = [...cols.map((c) => toSqlite(patch[c])), args.rowId];
      await db.runAsync(`UPDATE ${args.table} SET ${assign} WHERE id = ?`, values);
    }

    const payloadForServer =
      args.op === 'delete'
        ? { id: args.rowId, deleted_at: now, updated_at: now }
        : { id: args.rowId, ...(args.payload ?? {}) };
    await db.runAsync(
      `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
      [args.table, args.op, args.rowId, JSON.stringify(payloadForServer)],
    );
  });
}

function toSqlite(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
