/**
 * Sync UI-state helpers. Pure, no React / no DOM. Ported from
 * legacy-web/src/lib/syncHelpers.ts and extended to model the
 * outbox-pending state that the mobile sync engine surfaces.
 */
import type { SyncState } from './domain';

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
