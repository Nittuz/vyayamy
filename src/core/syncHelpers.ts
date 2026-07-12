/**
 * Sync UI-state helpers. Pure, no React / no DOM.
 */
import type { SyncState } from './domain';

/**
 * Transient sync failure message patterns — the single source of truth (#42/#43).
 *
 * Consumed by:
 *   - push retry classification (src/sync/push.ts isTransientError), layered
 *     under its status/code checks — transient failures must NOT increment
 *     outbox attempts;
 *   - toast suppression (src/ui/syncErrors.ts isSyncError), which ADDS its
 *     UI-only wrapper-name patterns on top.
 *
 * Do not fork this list again: the two former copies disagreed ('enotfound'
 * missing from retry classification, 'rate limit' missing from toast
 * suppression), which is exactly the drift this module exists to prevent.
 */
const TRANSIENT_SYNC_MESSAGE_PATTERNS = [
  'network',
  'fetch', // covers 'failed to fetch' and 'fetch failed'
  'timeout',
  'econn', // ECONNREFUSED / ECONNRESET / ECONNABORTED
  'enotfound', // DNS resolution failure
  'jwt', // expired/missing session — refresh, don't quarantine
  'rate limit',
  'too many requests',
  'temporarily unavailable',
  'service unavailable',
] as const;

/** True when an error MESSAGE pattern-matches a transient sync/network failure. */
export function isTransientSyncMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return TRANSIENT_SYNC_MESSAGE_PATTERNS.some((p) => lower.includes(p));
}

export function deriveSyncState(args: {
  online: boolean;
  pushing: boolean;
  pulling: boolean;
  pendingOutbox: number;
  lastError: string | null;
  showSaved: boolean;
}): SyncState {
  if (!args.online) return 'offline';
  if (args.pushing || args.pulling) return 'saving';
  if (args.lastError) return 'error';
  if (args.showSaved) return 'saved';
  if (args.pendingOutbox > 0) return 'saving';
  return 'idle';
}

export function syncStateLabel(state: SyncState): string {
  switch (state) {
    case 'saving':
      return 'Syncing\u2026';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Sync failed';
    case 'offline':
      return 'Offline. Saved locally.';
    case 'idle':
      return '';
  }
}
