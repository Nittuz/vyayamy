import { getDb, initDb, resetDbForTests } from '@/db/client';
import {
  getActiveWorkout,
  getRecentWorkouts,
  createWorkout,
  deleteWorkoutLocal,
  deleteWorkoutAndRecompute,
  finishWorkout,
} from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { listSetsForWorkoutExercise, updateSet } from '@/queries/sets';
import { getGroupedPRs } from '@/queries/personalRecords';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'wq-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedWorkout(id: string, startedAt: string, ended: boolean) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, USER, startedAt, ended ? startedAt : null, 'W', T, T],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

describe('getActiveWorkout', () => {
  test('returns the most recent unfinished workout', async () => {
    await seedWorkout('finished', '2026-02-01T10:00:00.000Z', true);
    await seedWorkout('active-old', '2026-02-02T10:00:00.000Z', false);
    await seedWorkout('active-new', '2026-02-03T10:00:00.000Z', false);
    const active = await getActiveWorkout(USER);
    expect(active!.id).toBe('active-new');
  });

  test('returns null when nothing is in progress', async () => {
    await seedWorkout('finished', '2026-02-01T10:00:00.000Z', true);
    expect(await getActiveWorkout(USER)).toBeNull();
  });
});

describe('getRecentWorkouts', () => {
  test('returns finished workouts newest-first, honoring the limit', async () => {
    await seedWorkout('a', '2026-02-01T10:00:00.000Z', true);
    await seedWorkout('b', '2026-02-02T10:00:00.000Z', true);
    await seedWorkout('c', '2026-02-03T10:00:00.000Z', true);
    await seedWorkout('active', '2026-02-04T10:00:00.000Z', false);

    const recent = await getRecentWorkouts(USER, 2);
    expect(recent.map((w) => w.id)).toEqual(['c', 'b']);
  });
});

describe('createWorkout', () => {
  test('inserts a workout and defaults the title to the day of week', async () => {
    const id = await createWorkout({ userId: USER });
    const db = await getDb();
    const row = await db.getFirstAsync<{ title: string; ended_at: string | null }>(
      'SELECT title, ended_at FROM workouts WHERE id = ?',
      [id],
    );
    expect(row!.ended_at).toBeNull();
    // default title is a weekday name
    expect([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]).toContain(row!.title);
  });

  test('honors an explicit title', async () => {
    const id = await createWorkout({ userId: USER, title: 'Leg Day' });
    const active = await getActiveWorkout(USER);
    expect(active!.id).toBe(id);
    expect(active!.title).toBe('Leg Day');
  });
});

describe('deleteWorkoutLocal', () => {
  test('cascade soft-deletes the workout, its exercises, and sets', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['ex', 'Bench', 'Chest', null, T, T],
    );
    const wId = await createWorkout({ userId: USER, title: 'Push' });
    const { weId } = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });

    await deleteWorkoutLocal(wId);

    expect(await getActiveWorkout(USER)).toBeNull();
    const sets = await listSetsForWorkoutExercise(weId);
    expect(sets).toHaveLength(0);

    const we = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM workout_exercises WHERE id = ?',
      [weId],
    );
    expect(we!.deleted_at).not.toBeNull();

    // delete tombstones are queued for workout + child rows
    const deletes = await db.getAllAsync<{ table_name: string }>(
      "SELECT table_name FROM outbox WHERE op = 'delete'",
    );
    const tables = deletes.map((d) => d.table_name);
    expect(tables).toContain('workouts');
    expect(tables).toContain('workout_exercises');
    expect(tables).toContain('sets');
  });
});

describe('deleteWorkoutAndRecompute', () => {
  test('cascades the soft-delete and recomputes PRs so a deleted workout stops counting', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['ex', 'Bench', 'Chest', null, T, T],
    );
    const wId = await createWorkout({ userId: USER, title: 'Push' });
    const { weId } = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
    const staged = await listSetsForWorkoutExercise(weId);
    await updateSet(staged[0]!.id, { weight: 100, reps: 5, completed: true });
    await finishWorkout(wId, USER);

    // Sanity: finishing recorded a heaviest-weight PR for the exercise.
    const before = await getGroupedPRs(USER);
    expect(before[0]?.records.some((r) => r.type === 'heaviest_weight')).toBe(true);

    await deleteWorkoutAndRecompute(USER, wId, ['ex']);

    // (a) workout row deleted, cascade reached the set
    const workoutRow = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM workouts WHERE id = ?',
      [wId],
    );
    expect(workoutRow!.deleted_at).not.toBeNull();
    expect(await listSetsForWorkoutExercise(weId)).toHaveLength(0);

    // (b) the exercise's heaviest_weight PR no longer reflects the deleted set
    // — recompute's SQL only counts w.deleted_at IS NULL, so the PR is dropped.
    const after = await getGroupedPRs(USER);
    expect(after).toHaveLength(0);
  });

  test('dedupes exerciseIds so recompute only runs once per exercise', async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['ex', 'Bench', 'Chest', null, T, T],
    );
    const wId = await createWorkout({ userId: USER, title: 'Push' });
    await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
    await finishWorkout(wId, USER);

    // Passing a duplicated exerciseId must not throw or double-run.
    await expect(deleteWorkoutAndRecompute(USER, wId, ['ex', 'ex'])).resolves.toBeUndefined();
  });
});
