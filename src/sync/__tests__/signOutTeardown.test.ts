/**
 * Characterization test for the sign-out teardown ordering (#80).
 *
 * The ordering in handleSignOut is load-bearing and previously untested:
 *
 *   1. AWAIT any in-flight push/pull — a pull page that resolves after the
 *      wipe would otherwise write the previous user's rows into the fresh DB.
 *   2. Clear all user-scoped KV (Today snapshot, rest timer, overrides).
 *   3. Clear the React Query cache.
 *   4. resetLocalDb (delete + re-bootstrap the SQLite file) LAST.
 *
 * This test holds a pull in flight, signs out, has the pull write a row as it
 * settles, and asserts (a) teardown blocked on the pull, (b) the recorded
 * event order, (c) the late-arriving row does not survive into the fresh DB.
 */
import type { QueryClient } from '@tanstack/react-query';

import { getDb, initDb, resetDbForTests } from '@/db/client';
import { handleSignOut, startSyncEngine, stopSyncEngine, triggerPull } from '@/sync/engine';
import { pullOnce } from '@/sync/pull';
import { setSyncState } from '@/sync/state';

const mockEvents: string[] = [];

jest.mock('@/sync/pull', () => ({ pullOnce: jest.fn(async () => {}) }));

jest.mock('@/lib/kvStore', () => ({
  clearAllUserScopedKv: jest.fn(async () => {
    mockEvents.push('clearKv');
  }),
}));

jest.mock('@/db/client', () => {
  const actual = jest.requireActual('@/db/client');
  return {
    ...actual,
    resetLocalDb: jest.fn(async () => {
      mockEvents.push('resetLocalDb');
      await actual.resetLocalDb();
    }),
  };
});

// startSyncEngine needs AppState; the global react-native stub only has Platform.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: 26, select: (spec: { ios: unknown }) => spec.ios },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('@/auth/supabase', () => ({
  supabase: {
    from: () => ({}),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

const mockPull = pullOnce as jest.Mock;
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

const fakeQueryClient = {
  clear: jest.fn(() => {
    mockEvents.push('clientClear');
  }),
  invalidateQueries: jest.fn(),
} as unknown as QueryClient;

beforeEach(async () => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
});

afterEach(() => {
  stopSyncEngine();
});

test('sign-out ordering: in-flight pull settles first, its late write is wiped, KV + query cache cleared before the DB reset (#80)', async () => {
  startSyncEngine(fakeQueryClient);

  // Hold a pull in flight; when released it writes a row — the way a late
  // pull page would land rows of the signed-out user.
  let releasePull: () => void = () => {};
  const gate = new Promise<void>((r) => (releasePull = r));
  mockPull.mockImplementationOnce(async () => {
    await gate;
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at)
         VALUES ('w-late', 'prev-user', '2026-01-01', 'Late page', '2026-01-01', '2026-01-01')`,
    );
    mockEvents.push('pullSettled');
  });

  const pull = triggerPull();
  let signedOut = false;
  const signOut = handleSignOut().then(() => {
    signedOut = true;
  });

  await tick();
  // Teardown is BLOCKED on the in-flight pull: nothing torn down yet.
  expect(signedOut).toBe(false);
  expect(mockEvents).toEqual([]);

  releasePull();
  await Promise.all([pull, signOut]);
  expect(signedOut).toBe(true);

  // The pinned ordering: pull settled → user-scoped KV cleared → query cache
  // cleared → local DB reset LAST.
  expect(mockEvents).toEqual(['pullSettled', 'clearKv', 'clientClear', 'resetLocalDb']);

  // The row the late pull wrote must NOT survive into the fresh database.
  const db = await getDb();
  const workouts = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM workouts');
  expect(workouts?.c).toBe(0);
});

test('sign-out with nothing in flight still tears down in the same order (#80)', async () => {
  startSyncEngine(fakeQueryClient);

  await handleSignOut();

  expect(mockEvents).toEqual(['clearKv', 'clientClear', 'resetLocalDb']);
});
