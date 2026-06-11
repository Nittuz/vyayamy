/**
 * Regression guard for deep-review #34: pushing after a local write was a
 * 13-call-site convention (every mutation had to remember `void triggerPush()`),
 * coupling the queries layer to the sync engine. Now enqueueMutation emits a
 * "mutation committed" event and the engine subscribes — queries never import sync.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { emitMutationCommitted, onMutationCommitted } from '@/db/mutationEvents';
import { uuidv4 } from '@/db/uuid';

jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));

describe('mutation event bus', () => {
  test('subscribers are notified on emit, and unsubscribe stops it', () => {
    const fn = jest.fn();
    const off = onMutationCommitted(fn);
    emitMutationCommitted();
    emitMutationCommitted();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    emitMutationCommitted();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('a thrown subscriber does not break the emit', () => {
    const good = jest.fn();
    const offBad = onMutationCommitted(() => {
      throw new Error('boom');
    });
    const offGood = onMutationCommitted(good);
    expect(() => emitMutationCommitted()).not.toThrow();
    expect(good).toHaveBeenCalled();
    offBad();
    offGood();
  });
});

test('enqueueMutation emits a mutation-committed event (#34)', async () => {
  await resetDbForTests();
  await initDb();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, user_id, created_at, updated_at) VALUES ('ex','B',NULL,'2026','2026')`,
  );

  const fn = jest.fn();
  const off = onMutationCommitted(fn);
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId: uuidv4(),
    payload: { user_id: 'u', started_at: '2026', title: 'W', ended_at: null },
  });
  off();

  expect(fn).toHaveBeenCalled();
});
