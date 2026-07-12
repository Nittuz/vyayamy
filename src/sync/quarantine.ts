/**
 * Quarantined outbox rows — entries that have failed to push MAX_ATTEMPTS
 * times. They sit in the outbox forever until the user explicitly retries
 * or discards. The Phase 2 banner surfaces stale ones (>24h old).
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
import { SOFT_DELETE_CASCADE } from '@/db/mutations';
import { SYNCED_TABLES } from '@/db/schema';
import { withTransaction } from '@/db/transaction';
import { triggerPush } from '@/sync/engine';
import { MAX_ATTEMPTS } from '@/sync/push';

export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface QuarantinedRow {
  id: number;
  table_name: string;
  op: string;
  row_id: string;
  payload_json: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export async function getQuarantined(): Promise<QuarantinedRow[]> {
  const db = await getDb();
  return db.getAllAsync<QuarantinedRow>(
    `SELECT id, table_name, op, row_id, payload_json, created_at, attempts, last_error
       FROM outbox
       WHERE attempts >= ?
       ORDER BY id ASC`,
    [MAX_ATTEMPTS],
  );
}

export function getStaleQuarantined(
  rows: QuarantinedRow[],
  now: number = Date.now(),
): QuarantinedRow[] {
  return rows.filter((r) => {
    const age = now - new Date(r.created_at).getTime();
    return Number.isFinite(age) && age >= STALE_THRESHOLD_MS;
  });
}

export function useQuarantined() {
  return useQuery({
    queryKey: ['outbox', 'quarantined'],
    queryFn: getQuarantined,
    staleTime: 5_000,
  });
}

export async function retryQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE id = ?', [id]);
  void triggerPush();
}

export async function retryAllQuarantined(): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE attempts >= ?', [
    MAX_ATTEMPTS,
  ]);
  void triggerPush();
}

/** Hard-delete a discarded row's FK children and every outbox op that targets
 *  them, depth-first, so nothing is left pointing at a row we removed (#6).
 *  Walks the SHARED cascade map from db/mutations.ts (#9) — no hand-mirrored
 *  copy to drift out of date. */
async function cascadeDiscard(
  db: Awaited<ReturnType<typeof getDb>>,
  parentTable: string,
  parentId: string,
): Promise<void> {
  const children = SOFT_DELETE_CASCADE[parentTable as keyof typeof SOFT_DELETE_CASCADE];
  if (!children) return;
  for (const { table, fk } of children) {
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE ${fk} = ?`, [
      parentId,
    ]);
    for (const child of rows) {
      await cascadeDiscard(db, table, child.id);
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [child.id]);
      await db.runAsync('DELETE FROM outbox WHERE table_name = ? AND row_id = ?', [
        table,
        child.id,
      ]);
    }
  }
}

/** Tables a discard may touch locally — DERIVED from SYNCED_TABLES (#9), so a
 *  newly synced table is automatically discard-safe. The former hand copy
 *  omitted the four plan_preset* tables, leaving their local rows orphaned
 *  after a discard. (Only synced tables ever appear in the outbox, so the set
 *  doubles as a guard against a corrupt table_name reaching template SQL.) */
export const DISCARD_SAFE_TABLES: ReadonlySet<string> = new Set(SYNCED_TABLES);

export async function discardQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  const outboxRow = await db.getFirstAsync<{
    table_name: string;
    op: string;
    row_id: string;
  }>('SELECT table_name, op, row_id FROM outbox WHERE id = ?', [id]);

  if (!outboxRow) return;

  const { table_name: table, op, row_id: rowId } = outboxRow;

  await withTransaction(db, async () => {
    if (DISCARD_SAFE_TABLES.has(table)) {
      if (op === 'insert' || op === 'upsert') {
        // Discarding an insert abandons the row — its FK children (and their
        // outbox ops) must go too, or they dangle pointing at a deleted parent.
        await cascadeDiscard(db, table, rowId);
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [rowId]);
      } else if (op === 'delete') {
        await db.runAsync(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`, [rowId]);
      }
      // op === 'update': leave the local row alone
    }

    // Remove EVERY outbox op for this row, not just the discarded one — a sibling
    // update/insert left behind would try to touch a row we just removed and
    // fail forever (#6).
    await db.runAsync('DELETE FROM outbox WHERE table_name = ? AND row_id = ?', [table, rowId]);
  });
}

export async function discardAllQuarantined(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM outbox WHERE attempts >= ?', [
    MAX_ATTEMPTS,
  ]);
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await discardQuarantinedRow(row.id);
  }
}

export function summarizeRow(row: QuarantinedRow): string {
  try {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (row.table_name === 'sets' && payload.weight != null && payload.reps != null) {
      return `Set · ${String(payload.weight)} × ${String(payload.reps)}`;
    }
    if (row.table_name === 'workouts' && payload.title != null) {
      return `Workout · "${String(payload.title)}"`;
    }
    return `${row.table_name} · ${row.op}`;
  } catch {
    return `${row.table_name} · ${row.op}`;
  }
}
