import { triggerPush, triggerPull, runSyncCycle, handleSignOut } from '@/sync/engine';
import { getSyncState, setSyncState } from '@/sync/state';
import { pushOutbox } from '@/sync/push';
import { pullOnce } from '@/sync/pull';
import { getDb, initDb, resetDbForTests } from '@/db/client';

jest.mock('@/sync/push', () => ({ pushOutbox: jest.fn(async () => {}), MAX_ATTEMPTS: 5 }));
jest.mock('@/sync/pull', () => ({ pullOnce: jest.fn(async () => {}) }));
jest.mock('@/auth/supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

const mockPush = pushOutbox as jest.Mock;
const mockPull = pullOnce as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockImplementation(async () => {});
  mockPull.mockImplementation(async () => {});
  setSyncState({ online: true, lastError: null, lastErrorAt: null });
});

describe('triggerPush', () => {
  test('does nothing while offline', async () => {
    setSyncState({ online: false });
    await triggerPush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('drains the outbox and clears the last error on success', async () => {
    setSyncState({ lastError: 'stale error' });
    await triggerPush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(getSyncState().lastError).toBeNull();
  });

  test('records the error message when the push fails', async () => {
    mockPush.mockRejectedValueOnce(new Error('network down'));
    await triggerPush();
    expect(getSyncState().lastError).toBe('network down');
    expect(getSyncState().lastErrorAt).not.toBeNull();
  });

  test('coalesces concurrent calls — only one push runs at a time', async () => {
    let release: () => void = () => {};
    mockPush.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));

    const first = triggerPush();
    const second = triggerPush();
    expect(mockPush).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
  });
});

describe('triggerPull', () => {
  test('does nothing while offline', async () => {
    setSyncState({ online: false });
    await triggerPull();
    expect(mockPull).not.toHaveBeenCalled();
  });

  test('pulls and clears the last error on success', async () => {
    setSyncState({ lastError: 'stale' });
    await triggerPull();
    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(getSyncState().lastError).toBeNull();
  });

  test('records the error message when the pull fails', async () => {
    mockPull.mockRejectedValueOnce(new Error('pull boom'));
    await triggerPull();
    expect(getSyncState().lastError).toBe('pull boom');
  });
});

describe('handleSignOut (#1)', () => {
  const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

  test('waits for an in-flight push to settle before wiping the database', async () => {
    let release: () => void = () => {};
    mockPush.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));

    const push = triggerPush(); // in flight, not yet resolved
    let signedOut = false;
    const signOut = handleSignOut().then(() => {
      signedOut = true;
    });

    await tick();
    expect(signedOut).toBe(false); // blocked on the in-flight push

    release();
    await Promise.all([push, signOut]);
    expect(signedOut).toBe(true);
  });

  test('leaves a fresh, usable, empty database (no "no such table", outbox empty)', async () => {
    await resetDbForTests();
    await initDb();
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at)
         VALUES ('w1', 'prev-user', ?, 'W', ?, ?)`,
      ['2026-01-01', '2026-01-01', '2026-01-01'],
    );
    await db.runAsync(
      `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES ('workouts','insert','w1','{}')`,
    );

    await handleSignOut();

    const db2 = await getDb(); // reopened after wipe
    const workouts = await db2.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM workouts');
    const outbox = await db2.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM outbox');
    expect(workouts?.c).toBe(0); // previous user's data gone
    expect(outbox?.c).toBe(0);
  });
});

describe('runSyncCycle', () => {
  test('pushes before it pulls', async () => {
    const order: string[] = [];
    mockPush.mockImplementationOnce(async () => {
      order.push('push');
    });
    mockPull.mockImplementationOnce(async () => {
      order.push('pull');
    });

    await runSyncCycle();
    expect(order).toEqual(['push', 'pull']);
  });

  test('still pulls even if the push failed', async () => {
    mockPush.mockRejectedValueOnce(new Error('push failed'));
    await runSyncCycle();
    expect(mockPull).toHaveBeenCalledTimes(1);
  });
});
