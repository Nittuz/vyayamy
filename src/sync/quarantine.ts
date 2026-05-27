/**
 * Quarantined outbox rows — entries that have failed to push MAX_ATTEMPTS
 * times. They sit in the outbox forever until the user explicitly retries
 * or discards. The Phase 2 banner surfaces stale ones (>24h old).
 */
import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/db/client';
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
  await db.runAsync(
    'UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE attempts >= ?',
    [MAX_ATTEMPTS],
  );
  void triggerPush();
}

export async function discardQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

export async function discardAllQuarantined(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE attempts >= ?', [MAX_ATTEMPTS]);
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
