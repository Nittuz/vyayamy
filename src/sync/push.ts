/**
 * Outbox push — Phase 2 implementation.
 *
 * Drains the outbox FIFO, applying each mutation against Supabase via
 * the PostgREST surface. On success the outbox row is deleted; on
 * failure its attempts/last_error are incremented. Failed rows beyond
 * MAX_ATTEMPTS are quarantined (skipped) so they don't block the queue.
 * Exponential backoff is applied per-row based on attempt count.
 */
import { supabase } from '@/auth/supabase';
import { getDb } from '@/db/client';

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
}

const MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

function backoffMs(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 30_000);
}

export async function pushOutbox(): Promise<void> {
  const db = await getDb();
  setSyncState({ pushInFlight: true });
  try {
    const rows = await db.getAllAsync<OutboxRow>(
      'SELECT * FROM outbox WHERE attempts < ? ORDER BY id ASC LIMIT ?',
      [MAX_ATTEMPTS, BATCH_LIMIT],
    );

    for (const row of rows) {
      if (row.attempts > 0) {
        const waitMs = backoffMs(row.attempts);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;

      try {
        const tbl = fromDynamic(row.table_name);
        if (row.op === 'delete') {
          const { error } = await tbl
            .update({ deleted_at: new Date().toISOString() } as never)
            .eq('id', row.row_id);
          if (error) throw error;
        } else if (row.op === 'upsert') {
          const { error } = await tbl.upsert(payload as never);
          if (error) throw error;
        } else if (row.op === 'insert') {
          const { error } = await tbl.insert(payload as never);
          if (error) throw error;
        } else {
          const { error } = await tbl.update(payload as never).eq('id', row.row_id);
          if (error) throw error;
        }

        await db.runAsync('DELETE FROM outbox WHERE id = ?', [row.id]);
      } catch (err) {
        const msg = errorMessage(err);
        await db.runAsync(
          'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [msg, row.id],
        );
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
    });
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
