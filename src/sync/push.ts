/**
 * Outbox push.
 *
 * Drains the outbox FIFO, applying each mutation against Supabase via the
 * PostgREST surface. Design choices that matter for correctness:
 *
 *   - Inserts are sent as upserts on the row's PK so a kill-mid-ack on the
 *     client never produces a 23505 collision on retry. (See "idempotency"
 *     below.)
 *   - personal_records uses a composite-unique upsert; two devices that
 *     compute the same PR each generate distinct ids but must collapse to
 *     one row by (user_id, exercise_id, type).
 *   - updated_at is NEVER sent to the server. The server-side BEFORE
 *     INSERT/UPDATE trigger (00009) is authoritative; client clocks are
 *     untrusted.
 *   - 401/403/network errors are transient. Incrementing `attempts` on
 *     them would quarantine valid local writes the moment a session
 *     expires — instead we leave the row at its current attempt count,
 *     surface the error to the UI, and try again on the next sync cycle.
 *   - Backoff is skip-and-continue, not blocking. A row in its backoff
 *     window is left behind; the FIFO never blocks on the head row.
 */
import { supabase } from '@/auth/supabase';
import { getDb } from '@/db/client';
import type { SyncedTable } from '@/db/schema';
import { withTransaction } from '@/db/transaction';

import { setSyncState } from './state';

type AnyTable = ReturnType<typeof supabase.from>;
function fromDynamic(table: string): AnyTable {
  return (supabase as unknown as { from: (t: string) => AnyTable }).from(table);
}

interface OutboxRow {
  id: number;
  table_name: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  row_id: string;
  payload_json: string;
  attempts: number;
  next_attempt_at: string | null;
}

export const MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

/** Per-table override for upsert conflict target. Defaults to the PK (id).
 *  (personal_records is no longer synced — it is a local derived cache, #138.) */
const UPSERT_CONFLICT_TARGET: Partial<Record<SyncedTable, string>> = {};

/** Columns the server owns; never send them. */
const SERVER_OWNED_COLUMNS = new Set(['updated_at']);

function backoffMs(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 30_000);
}

/**
 * Schedule a follow-up drain for a backed-off row, injected by the sync engine
 * (push must not import the engine). Defaults to a no-op so push stays usable in
 * isolation and in tests that don't care about retries.
 */
let scheduleRetry: (delayMs: number) => void = () => {};
export function __setRetryScheduler(fn: ((delayMs: number) => void) | null): void {
  scheduleRetry = fn ?? (() => {});
}

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status === 401 || e.status === 403) return true;
  // A brief Supabase/gateway outage (5xx) or a rate-limit (429) is transient:
  // incrementing attempts here marches valid local writes to quarantine within
  // ~30s of backoff windows for an outage that resolves on its own (#3).
  if (typeof e.status === 'number' && e.status >= 500) return true;
  if (e.status === 429) return true;
  if (e.code === 'PGRST301' || e.code === 'PGRST302') return true; // JWT expired/missing
  const msg = (e.message ?? '').toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('jwt') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable')
  ) {
    return true;
  }
  return false;
}

function stripServerOwned(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!SERVER_OWNED_COLUMNS.has(k)) out[k] = v;
  }
  return out;
}

export async function pushOutbox(): Promise<void> {
  const db = await getDb();
  setSyncState({ pushInFlight: true });
  try {
    // Drain in passes: a row's later op becomes eligible only once its earlier
    // sibling ships (#0 ordering), and a large outbox exceeds one batch — so keep
    // going while a pass makes progress instead of stopping after 50 (#5). Each
    // successful pass removes ≥1 row from a finite outbox, so this terminates.
    let firstError: string | null = null;
    for (;;) {
      const { succeeded, firstError: passError } = await drainBatch(db);
      if (firstError === null) firstError = passError;
      if (succeeded === 0) break;
    }

    const pending = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM outbox WHERE attempts < ?',
      [MAX_ATTEMPTS],
    );
    const quarantined = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM outbox WHERE attempts >= ?',
      [MAX_ATTEMPTS],
    );
    setSyncState({
      pendingOutbox: pending?.c ?? 0,
      quarantinedOutbox: quarantined?.c ?? 0,
      lastPushedAt: new Date().toISOString(),
      lastError: firstError,
    });

    // Wake backed-off rows: schedule one follow-up drain for the earliest
    // next_attempt_at so a transient failure recovers on its own (#5).
    const nextRetry = await db.getFirstAsync<{ at: string | null }>(
      `SELECT MIN(next_attempt_at) AS at FROM outbox
         WHERE attempts < ? AND next_attempt_at IS NOT NULL`,
      [MAX_ATTEMPTS],
    );
    if (nextRetry?.at) {
      scheduleRetry(Math.max(0, new Date(nextRetry.at).getTime() - Date.now()));
    }
  } finally {
    setSyncState({ pushInFlight: false });
  }
}

/** Process one eligible batch. Returns how many rows shipped (for the drain
 *  loop) and the first error seen (for the UI). */
async function drainBatch(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<{ succeeded: number; firstError: string | null }> {
  const nowIso = new Date().toISOString();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox o
       WHERE o.attempts < ?
         AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
         AND NOT EXISTS (
           SELECT 1 FROM outbox e
            WHERE e.table_name = o.table_name AND e.row_id = o.row_id AND e.id < o.id
         )
       ORDER BY o.id ASC LIMIT ?`,
    [MAX_ATTEMPTS, nowIso, BATCH_LIMIT],
  );

  let firstError: string | null = null;
  let succeeded = 0;

  for (const row of rows) {
    const rawPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
    const payload = stripServerOwned(rawPayload);

    try {
        const tbl = fromDynamic(row.table_name);
        if (row.op === 'delete') {
          // Send only the tombstone marker; server overwrites updated_at.
          // .select('id') lets us verify a row actually matched — a 0-row
          // PostgREST update reports no error, which would otherwise delete the
          // outbox row and silently drop the write (#0).
          const { data, error } = await tbl
            .update({ deleted_at: new Date().toISOString() } as never)
            .eq('id', row.row_id)
            .select('id');
          if (error) throw error;
          assertServerRowMatched(data, row);
        } else if (row.op === 'update') {
          const { data, error } = await tbl
            .update(payload as never)
            .eq('id', row.row_id)
            .select('id');
          if (error) throw error;
          assertServerRowMatched(data, row);
        } else {
          // 'insert' is treated as upsert(by-id) for kill-mid-ack idempotency.
          // 'upsert' uses the table-specific composite target if set.
          const conflictTarget = UPSERT_CONFLICT_TARGET[row.table_name as SyncedTable];
          const opts = conflictTarget ? { onConflict: conflictTarget } : undefined;
          if (opts?.onConflict && opts.onConflict !== 'id') {
            // Composite-key upsert. Capture the server-returned row id and
            // reconcile if it differs from the local one (per audit fix #2).
            const { data: serverRow, error: upsertErr } = await tbl
              .upsert(payload as never, opts)
              .select('id')
              .single();
            if (upsertErr) throw upsertErr;
            const serverId = (serverRow as { id?: string } | null)?.id;
            if (typeof serverId === 'string' && serverId !== row.row_id) {
              await reconcileLocalRowId(row.table_name, row.row_id, serverId);
            }
          } else {
            const { error } = opts
              ? await tbl.upsert(payload as never, opts)
              : await tbl.upsert(payload as never);
            if (error) throw error;
          }
        }

        await db.runAsync('DELETE FROM outbox WHERE id = ?', [row.id]);
        succeeded += 1;
      } catch (err) {
        const msg = errorMessage(err);
        if (firstError === null) firstError = msg;

        if (isTransientError(err)) {
          // Don't increment attempts; just log so the UI can show a status.
          await db.runAsync('UPDATE outbox SET last_error = ? WHERE id = ?', [msg, row.id]);
        } else {
          const nextAttempts = row.attempts + 1;
          const nextAt =
            nextAttempts < MAX_ATTEMPTS
              ? new Date(Date.now() + backoffMs(nextAttempts)).toISOString()
              : null;
          await db.runAsync(
            `UPDATE outbox
               SET attempts = ?, last_error = ?, next_attempt_at = ?
               WHERE id = ?`,
            [nextAttempts, msg, nextAt, row.id],
          );
        }
      }
    }

  return { succeeded, firstError };
}

/**
 * Throw (non-transient) if a PostgREST update/delete matched no server row.
 * Without this a 0-row update returns `{ error: null }` and the outbox row is
 * deleted, silently losing the write (#0). With per-row ordering in place a
 * genuine miss means the row is unexpectedly absent server-side, so it should
 * march toward quarantine rather than vanish.
 */
function assertServerRowMatched(data: unknown, row: OutboxRow): void {
  const matched = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (matched === 0) {
    throw new Error(`No server row matched ${row.table_name}#${row.row_id} (${row.op})`);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(err);
}

/** Tables for which reconcileLocalRowId is permitted to run. */
const RECONCILE_SAFE_TABLES = new Set(['personal_records']);

/**
 * Update a local row's primary key to match the server-authoritative id
 * after a composite-key upsert revealed a different id existed.
 * Done in a transaction so a crash mid-update doesn't leave dangling refs.
 */
async function reconcileLocalRowId(
  table: string,
  oldId: string,
  newId: string,
): Promise<void> {
  if (!RECONCILE_SAFE_TABLES.has(table)) return;
  const db = await getDb();
  await withTransaction(db, async () => {
    await db.runAsync(`UPDATE ${table} SET id = ? WHERE id = ?`, [newId, oldId]);
  });
}
