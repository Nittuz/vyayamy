/**
 * Local-first mutation primitive.
 *
 * Every user action that touches data calls enqueueMutation(). It:
 *   1. Applies the write to SQLite immediately.
 *   2. Appends an outbox row describing the server-side effect.
 *   3. For deletes on parent tables, also tombstones the FK children in
 *      the same transaction and enqueues child deletes — without this,
 *      a fresh device would pull "live" children of a tombstoned parent
 *      and they'd dangle forever.
 *
 * All three steps run inside a single SQLite transaction so the UI never
 * observes a partial state.
 *
 * The push engine drains the outbox asynchronously. Failures stay in the
 * outbox and are retried; the UI stays responsive regardless.
 */
import { getDb } from './client';
import { emitMutationCommitted } from './mutationEvents';
import type { SyncedTable } from './schema';
import { withTransaction } from './transaction';
import { nowIso } from './uuid';

export type MutationOp = 'insert' | 'update' | 'upsert' | 'delete';

interface EnqueueArgs {
  table: SyncedTable;
  op: MutationOp;
  rowId: string;
  /** Full row for insert/upsert; diff for update; ignored for delete. */
  payload?: Record<string, unknown>;
}

/**
 * FK relationships used to cascade deletes. table -> [(child, fk)].
 * SHARED single source of truth (#9): soft-delete cascade here AND the
 * quarantine discard cascade (src/sync/quarantine.ts) both walk this map —
 * a new parent/child relationship added here covers both paths.
 */
export const SOFT_DELETE_CASCADE: Partial<Record<SyncedTable, { table: SyncedTable; fk: string }[]>> = {
  workouts: [{ table: 'workout_exercises', fk: 'workout_id' }],
  workout_exercises: [{ table: 'sets', fk: 'workout_exercise_id' }],
  training_plans: [{ table: 'training_plan_slots', fk: 'plan_id' }],
};

export async function enqueueMutation(args: EnqueueArgs): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  await withTransaction(db, async () => {
    if (args.op === 'delete') {
      // Cascade-soft-delete children first so a fresh device's pull never
      // sees orphaned-yet-live rows. Walk depth-first.
      await cascadeSoftDelete(args.table, args.rowId, now);

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
        ? { id: args.rowId, deleted_at: now }
        : { id: args.rowId, ...(args.payload ?? {}) };
    await db.runAsync(
      `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
      [args.table, args.op, args.rowId, JSON.stringify(payloadForServer)],
    );
  });

  // The write committed — let the sync engine schedule a push (#34). Queries no
  // longer call triggerPush themselves.
  emitMutationCommitted();

  async function cascadeSoftDelete(parent: SyncedTable, parentId: string, ts: string): Promise<void> {
    const children = SOFT_DELETE_CASCADE[parent];
    if (!children) return;
    for (const { table, fk } of children) {
      const liveChildren = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ${table} WHERE ${fk} = ? AND deleted_at IS NULL`,
        [parentId],
      );
      for (const child of liveChildren) {
        await cascadeSoftDelete(table, child.id, ts);
        await db.runAsync(
          `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
          [ts, ts, child.id],
        );
        await db.runAsync(
          `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
          [table, 'delete', child.id, JSON.stringify({ id: child.id, deleted_at: ts })],
        );
      }
    }
  }
}

function toSqlite(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
