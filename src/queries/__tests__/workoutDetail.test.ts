import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getWorkoutDetail } from '@/queries/workoutDetail';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const T = '2026-01-01T00:00:00.000Z';

async function seedWorkout(id: string, deleted = false) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, 'u', T, null, 'Push', T, T, deleted ? T : null],
  );
}
async function seedExerciseRow(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, 'Chest', null, T, T],
  );
}
async function seedWE(
  id: string,
  workoutId: string,
  exerciseId: string,
  order: number,
  deleted = false,
) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, workoutId, exerciseId, order, T, T, deleted ? T : null],
  );
}
async function seedSet(id: string, weId: string, order: number, deleted = false) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, weId, order, 100, 5, 1, T, T, deleted ? T : null],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

test('returns null when the workout does not exist', async () => {
  expect(await getWorkoutDetail('missing')).toBeNull();
});

test('returns null for a soft-deleted workout', async () => {
  await seedWorkout('w1', true);
  expect(await getWorkoutDetail('w1')).toBeNull();
});

test('assembles nested exercises and sets in order', async () => {
  await seedWorkout('w1');
  await seedExerciseRow('e1', 'Bench Press');
  await seedExerciseRow('e2', 'Incline Press');
  await seedWE('we2', 'w1', 'e2', 1);
  await seedWE('we1', 'w1', 'e1', 0);
  await seedSet('s2', 'we1', 1);
  await seedSet('s1', 'we1', 0);
  await seedSet('s3', 'we2', 0);

  const detail = await getWorkoutDetail('w1');
  expect(detail).not.toBeNull();
  expect(detail!.workout.id).toBe('w1');
  // ordered by we.order_index ASC
  expect(detail!.exercises.map((e) => e.id)).toEqual(['we1', 'we2']);
  // sets ordered by s.order_index ASC
  expect(detail!.exercises[0]!.sets.map((s) => s.id)).toEqual(['s1', 's2']);
  expect(detail!.exercises[0]!.exercise!.name).toBe('Bench Press');
  expect(detail!.exercises[0]!.sets[0]!.completed).toBe(true);
});

test('excludes soft-deleted exercises and sets', async () => {
  await seedWorkout('w1');
  await seedExerciseRow('e1', 'Bench Press');
  await seedWE('we1', 'w1', 'e1', 0);
  await seedWE('we-dead', 'w1', 'e1', 1, true);
  await seedSet('s1', 'we1', 0);
  await seedSet('s-dead', 'we1', 1, true);

  const detail = await getWorkoutDetail('w1');
  expect(detail!.exercises.map((e) => e.id)).toEqual(['we1']);
  expect(detail!.exercises[0]!.sets.map((s) => s.id)).toEqual(['s1']);
});

test('returns a workout with no exercises as an empty list', async () => {
  await seedWorkout('w1');
  const detail = await getWorkoutDetail('w1');
  expect(detail!.exercises).toEqual([]);
});

test('exercise is null when the referenced exercise row is absent', async () => {
  await seedWorkout('w1');
  await seedWE('we1', 'w1', 'ghost-exercise', 0);
  await seedSet('s1', 'we1', 0);

  const detail = await getWorkoutDetail('w1');
  expect(detail!.exercises[0]!.exercise).toBeNull();
  expect(detail!.exercises[0]!.sets).toHaveLength(1);
});
