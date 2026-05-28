/**
 * Read-only preview of the most-recent pending outbox entries.
 * Used by the Phase 4 SyncDiagnosticsSheet.
 */
import { getDb } from '@/db/client';

import { MAX_ATTEMPTS } from './push';

export interface OutboxPreviewRow {
  id: number;
  table_name: string;
  op: string;
  row_id: string;
  created_at: string;
  attempts: number;
}

export async function getOutboxPreview(limit = 5): Promise<OutboxPreviewRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxPreviewRow>(
    `SELECT id, table_name, op, row_id, created_at, attempts
       FROM outbox
       WHERE attempts < ?
       ORDER BY id DESC
       LIMIT ?`,
    [MAX_ATTEMPTS, limit],
  );
}

export function relativeAge(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
