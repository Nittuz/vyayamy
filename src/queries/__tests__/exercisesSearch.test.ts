import { getDb, initDb, resetDbForTests } from '@/db/client';
import { searchExercises, createCustomExercise } from '@/queries/exercises';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'ex-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedExercise(id: string, name: string, userId: string | null, deleted = false) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, 'Chest', userId, T, T, deleted ? T : null],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

describe('searchExercises', () => {
  beforeEach(async () => {
    await seedExercise('g1', 'Bench Press', null);
    await seedExercise('g2', 'Back Squat', null);
    await seedExercise('mine', 'My Custom Curl', USER);
    await seedExercise('theirs', 'Their Secret Lift', 'other-user');
    await seedExercise('gone', 'Bench Deleted', null, true);
  });

  test('empty query returns all visible (global + own) exercises, name-sorted', async () => {
    const results = await searchExercises(USER, '');
    expect(results.map((e) => e.name)).toEqual(['Back Squat', 'Bench Press', 'My Custom Curl']);
  });

  test('filters by case-insensitive substring match', async () => {
    const results = await searchExercises(USER, 'bench');
    expect(results.map((e) => e.id)).toEqual(['g1']);
  });

  test('excludes other users and soft-deleted rows', async () => {
    const results = await searchExercises(USER, '');
    const ids = results.map((e) => e.id);
    expect(ids).not.toContain('theirs');
    expect(ids).not.toContain('gone');
  });
});

describe('createCustomExercise', () => {
  test('inserts a user-scoped exercise and queues an outbox insert', async () => {
    const id = await createCustomExercise({
      userId: USER,
      name: 'Cable Fly',
      muscleGroup: 'Chest',
    });

    const db = await getDb();
    const row = await db.getFirstAsync<{ name: string; user_id: string; muscle_group: string }>(
      'SELECT name, user_id, muscle_group FROM exercises WHERE id = ?',
      [id],
    );
    expect(row).toMatchObject({ name: 'Cable Fly', user_id: USER, muscle_group: 'Chest' });

    const outbox = await db.getAllAsync<{ op: string; table_name: string }>(
      'SELECT op, table_name FROM outbox WHERE row_id = ?',
      [id],
    );
    expect(outbox).toEqual([{ op: 'insert', table_name: 'exercises' }]);
  });

  test('defaults the muscle group to null when omitted', async () => {
    const id = await createCustomExercise({ userId: USER, name: 'Mystery Move' });
    const db = await getDb();
    const row = await db.getFirstAsync<{ muscle_group: string | null }>(
      'SELECT muscle_group FROM exercises WHERE id = ?',
      [id],
    );
    expect(row!.muscle_group).toBeNull();
  });
});
