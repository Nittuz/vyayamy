import { getDb, initDb, resetDbForTests } from '@/db/client';
import { enqueueMutation } from '@/db/mutations';
import { getOutboxCount } from '@/sync/outboxPreview';
import { MAX_ATTEMPTS } from '@/sync/push';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
});

async function enqueueWorkoutInsert(rowId: string): Promise<void> {
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId,
    payload: {
      user_id: 'u1',
      started_at: '2026-01-01T00:00:00.000Z',
      title: 'W',
      ended_at: null,
    },
  });
}

test('resolves 0 on a fresh/empty db', async () => {
  expect(await getOutboxCount()).toBe(0);
});

test('counts pending outbox rows seeded via enqueueMutation', async () => {
  await enqueueWorkoutInsert('w1');
  await enqueueWorkoutInsert('w2');
  expect(await getOutboxCount()).toBe(2);
});

test('excludes rows with attempts >= MAX_ATTEMPTS', async () => {
  await enqueueWorkoutInsert('w1');
  await enqueueWorkoutInsert('w2');
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = ? WHERE row_id = ?', [MAX_ATTEMPTS, 'w1']);
  expect(await getOutboxCount()).toBe(1);
});
