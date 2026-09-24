/**
 * The header sync pill must not be mounted at all when it has nothing to say:
 * on iOS 26+ the navigation bar wraps every header item in a glass capsule, so
 * an idle (empty) indicator rendered as an empty circle in the workout header
 * (build 10 on device). Visibility is the same rule the pill itself uses —
 * a non-empty label — lifted out so the screen can decide before mounting.
 */
import { isSyncIndicatorVisible } from '@/core/syncHelpers';
import type { SyncState } from '@/sync/state';

const idle: SyncState = {
  online: true,
  pushInFlight: false,
  pullInFlight: false,
  pendingOutbox: 0,
  quarantinedOutbox: 0,
  lastPushedAt: null,
  lastPulledAt: null,
  lastError: null,
  lastErrorAt: null,
};

test('idle and online with nothing pending: no pill', () => {
  expect(isSyncIndicatorVisible(idle)).toBe(false);
});

test('offline shows the pill', () => {
  expect(isSyncIndicatorVisible({ ...idle, online: false })).toBe(true);
});

test('a push or pull in flight shows the pill', () => {
  expect(isSyncIndicatorVisible({ ...idle, pushInFlight: true })).toBe(true);
  expect(isSyncIndicatorVisible({ ...idle, pullInFlight: true })).toBe(true);
});

test('a sync error shows the pill', () => {
  expect(isSyncIndicatorVisible({ ...idle, lastError: 'boom' })).toBe(true);
});
