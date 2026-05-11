/**
 * Pure-function unit tests for deriveSyncState — the reducer that the
 * SyncIndicator depends on. Touches no SQLite, no network, no React.
 */
import { deriveSyncState, syncStateLabel } from '@/core/syncHelpers';

test('offline overrides everything', () => {
  expect(
    deriveSyncState({
      online: false,
      pushing: true,
      pulling: true,
      pendingOutbox: 5,
      lastError: 'oops',
      showSaved: true,
    }),
  ).toBe('offline');
});

test('saving when push or pull in flight', () => {
  expect(
    deriveSyncState({
      online: true,
      pushing: true,
      pulling: false,
      pendingOutbox: 0,
      lastError: null,
      showSaved: false,
    }),
  ).toBe('saving');
  expect(
    deriveSyncState({
      online: true,
      pushing: false,
      pulling: true,
      pendingOutbox: 0,
      lastError: null,
      showSaved: false,
    }),
  ).toBe('saving');
});

test('saving when outbox has pending rows', () => {
  expect(
    deriveSyncState({
      online: true,
      pushing: false,
      pulling: false,
      pendingOutbox: 3,
      lastError: null,
      showSaved: false,
    }),
  ).toBe('saving');
});

test('error when last error set', () => {
  expect(
    deriveSyncState({
      online: true,
      pushing: false,
      pulling: false,
      pendingOutbox: 0,
      lastError: 'timeout',
      showSaved: false,
    }),
  ).toBe('error');
});

test('saved when explicitly requested and no other state', () => {
  expect(
    deriveSyncState({
      online: true,
      pushing: false,
      pulling: false,
      pendingOutbox: 0,
      lastError: null,
      showSaved: true,
    }),
  ).toBe('saved');
});

test('idle as default', () => {
  expect(
    deriveSyncState({
      online: true,
      pushing: false,
      pulling: false,
      pendingOutbox: 0,
      lastError: null,
      showSaved: false,
    }),
  ).toBe('idle');
});

test('syncStateLabel is empty for idle', () => {
  expect(syncStateLabel('idle')).toBe('');
  expect(syncStateLabel('saving')).toContain('Sync');
  expect(syncStateLabel('offline')).toContain('Offline');
  expect(syncStateLabel('error')).toContain('failed');
  expect(syncStateLabel('saved')).toBe('Saved');
});
