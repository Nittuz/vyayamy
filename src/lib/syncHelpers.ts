/**
 * Sync/persistence helpers — no React, no DOM.
 *
 * Pure functions for deriving sync state from mutation flags and
 * online status. Reusable by any client surface.
 */

import type { SyncState } from './domain';

/**
 * Derive the current sync state from component-level signals.
 * Priority: offline > saving > error > saved > idle.
 */
export function deriveSyncState(
  online: boolean,
  isPending: boolean,
  isError: boolean,
  showSaved: boolean,
): SyncState {
  if (!online) return 'offline';
  if (isPending) return 'saving';
  if (isError) return 'error';
  if (showSaved) return 'saved';
  return 'idle';
}

/** Human-readable label for a sync state. */
export function syncStateLabel(state: SyncState): string {
  switch (state) {
    case 'saving': return 'Saving\u2026';
    case 'saved': return 'Saved';
    case 'error': return 'Save failed';
    case 'offline': return 'Offline';
    case 'idle': return '';
  }
}

/**
 * Combine isPending / isError flags from multiple React Query mutations.
 * Avoids ad-hoc `a.isPending || b.isPending || ...` in components.
 */
export function combineMutationFlags(
  ...mutations: Array<{ isPending: boolean; isError: boolean }>
): { isPending: boolean; isError: boolean } {
  let isPending = false;
  let isError = false;
  for (const m of mutations) {
    if (m.isPending) isPending = true;
    if (m.isError) isError = true;
  }
  return { isPending, isError };
}
