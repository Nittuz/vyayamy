/**
 * Phase 3: pattern-match common transient sync/network failures.
 * These are surfaced via the SyncIndicator pill; toasting them during
 * active workout flow is noise that pulls attention off the lift.
 *
 * Message matching delegates to the shared classifier in core/syncHelpers
 * (#42/#43) — the same list push retry classification uses — plus a couple
 * of UI-ONLY patterns matching our own sync-cycle wrapper names that show
 * up in engine lastError strings. Those wrapper names must NOT leak into
 * push retry classification (they'd never appear in a PostgREST error, and
 * classifying them transient there would mask a real permanent failure).
 */
import { isTransientSyncMessage } from '@/core/syncHelpers';

const UI_ONLY_SYNC_PATTERNS = ['pushoutbox', 'pulloutbox'];

export function isSyncError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return isTransientSyncMessage(lower) || UI_ONLY_SYNC_PATTERNS.some((p) => lower.includes(p));
}
