/**
 * Phase 3: pattern-match common transient sync/network failures.
 * These are surfaced via the SyncIndicator pill; toasting them during
 * active workout flow is noise that pulls attention off the lift.
 */
const SYNC_ERROR_PATTERNS = [
  'network',
  'timeout',
  'fetch',
  'failed to fetch',
  'pushoutbox',
  'pulloutbox',
  'econn',
  'enotfound',
  'jwt',
];

export function isSyncError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return SYNC_ERROR_PATTERNS.some((p) => lower.includes(p));
}
