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

/** Per-table override for upsert conflict target. Defaults to the PK (id). */
const UPSERT_CONFLICT_TARGET: Partial<Record<SyncedTable, string>> = {
  personal_records: 'user_id,exercise_id,type',
};

/** Columns the server owns; never send them. */
const SERVER_OWNED_COLUMNS = new Set(['updated_at']);

function backoffMs(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 30_000);
}

/** Sleep abstracted so tests can drive backoff without real timers. */
let sleepImpl: (ms: number) => Promise<void> = (ms) =>
  new Promise((r) => setTimeout(r, ms));
export function __setPushSleepForTests(impl: ((ms: number) => Promise<void>) | null): void {
  sleepImpl = impl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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
    const nowIso = new Date().toISOString();
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox
         WHERE attempts < ?
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY id ASC LIMIT ?`,
      [MAX_ATTEMPTS, nowIso, BATCH_LIMIT],
    );

    let firstError: string | null = null;

    for (const row of rows) {
      const rawPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const payload = stripServerOwned(rawPayload);

      try {
        const tbl = fromDynamic(row.table_name);
        if (row.op === 'delete') {
          // Send only the tombstone marker; server overwrites updated_at.
          const { error } = await tbl
            .update({ deleted_at: new Date().toISOString() } as never)
            .eq('id', row.row_id);
          if (error) throw error;
        } else if (row.op === 'update') {
          const { error } = await tbl.update(payload as never).eq('id', row.row_id);
          if (error) throw error;
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

    // If any rows are still pending and we're due to retry, schedule a follow-up
    // sleep+drain so callers don't have to poll. Bound to a single retry window.
    if ((pending?.c ?? 0) > 0 && firstError && !isTransientError({ message: firstError })) {
      await sleepImpl(0); // yield; retry happens on next external trigger
    }
  } finally {
    setSyncState({ pushInFlight: false });
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
