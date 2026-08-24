/**
 * Integration test: repeat-last-workout clones a previous workout's
 * exercises in order, each pre-seeded with one empty set whose
 * weight/reps come from the most-recent COMPLETED set of that exercise
 * in the source workout.
 *
 * Asserts directly against SQLite + outbox (no Supabase round-trip).
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { getLastFinishedWorkoutWithSeeds, repeatLastWorkout } from '@/queries/repeatLastWorkout';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'user-repeat-test';
const EX_BENCH = '11111111-1111-1111-1111-111111111111';
const EX_OHP = '22222222-2222-2222-2222-222222222222';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });

  const db = await getDb();
  // Seed two exercises directly (not via outbox; these are catalog rows)
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      EX_BENCH,
      'Bench Press',
      'Chest',
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_OHP, 'OHP', 'Shoulders', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('getLastFinishedWorkoutWithSeeds returns null when user has no workouts', async () => {
  const result = await getLastFinishedWorkoutWithSeeds(USER_ID);
  expect(result).toBeNull();
});

test('getLastFinishedWorkoutWithSeeds returns seeded exercises in order', async () => {
  // Create + finish a workout with two exercises, three sets each.
  // addExerciseToWorkout / addSet auto-compute order_index inside their
  // own transactions — sequential awaits give us deterministic 0,1,2.
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const { weId: we1 } = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_BENCH });
  const { weId: we2 } = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_OHP });

  const s1a = await addSet(we1);
  await updateSet(s1a, { weight: 135, reps: 8, completed: true });
  const s1b = await addSet(we1);
  await updateSet(s1b, { weight: 175, reps: 5, completed: true });
  const s1c = await addSet(we1);
  await updateSet(s1c, { weight: 185, reps: 5, completed: true });

  const s2a = await addSet(we2);
  await updateSet(s2a, { weight: 95, reps: 8, completed: true });
  const s2b = await addSet(we2);
  await updateSet(s2b, { weight: 115, reps: 5, completed: true });

  await finishWorkout(wId);

  const result = await getLastFinishedWorkoutWithSeeds(USER_ID);
  expect(result).not.toBeNull();
  expect(result!.workout.title).toBe('Push');
  expect(result!.seeds).toHaveLength(2);
  expect(result!.seeds[0]!.exerciseId).toBe(EX_BENCH);
  expect(result!.seeds[0]!.exerciseName).toBe('Bench Press');
  expect(result!.seeds[0]!.seedWeight).toBe(185); // last completed
  expect(result!.seeds[0]!.seedReps).toBe(5);
  expect(result!.seeds[1]!.exerciseId).toBe(EX_OHP);
  expect(result!.seeds[1]!.seedWeight).toBe(115);
  expect(result!.seeds[1]!.seedReps).toBe(5);
});

test('repeatLastWorkout clones exercises in order with seeded sets', async () => {
  // Seed: previous workout with one exercise, two completed sets
  const wPrev = await createWorkout({ userId: USER_ID, title: 'Push' });
  const { weId: we } = await addExerciseToWorkout({ workoutId: wPrev, exerciseId: EX_BENCH });
  const s1 = await addSet(we);
  await updateSet(s1, { weight: 135, reps: 8, completed: true });
  const s2 = await addSet(we);
  await updateSet(s2, { weight: 185, reps: 5, completed: true });
  await finishWorkout(wPrev);

  // Act: repeat
  const result = await repeatLastWorkout(USER_ID);
  expect(result).not.toBeNull();
  const newWorkoutId = result!.workoutId;

  // Assert: new workout exists, has the same exercise in order 0, with one seeded set
  const db = await getDb();
  const newWorkout = await db.getFirstAsync<{ id: string; title: string; ended_at: string | null }>(
    'SELECT id, title, ended_at FROM workouts WHERE id = ?',
    [newWorkoutId],
  );
  expect(newWorkout).not.toBeNull();
  expect(newWorkout!.ended_at).toBeNull(); // active
  expect(newWorkout!.title).toBe('Push');

  const newWes = await db.getAllAsync<{ id: string; exercise_id: string; order_index: number }>(
    'SELECT id, exercise_id, order_index FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL ORDER BY order_index',
    [newWorkoutId],
  );
  expect(newWes).toHaveLength(1);
  expect(newWes[0]!.exercise_id).toBe(EX_BENCH);

  const newSets = await db.getAllAsync<{
    id: string;
    weight: number | null;
    reps: number | null;
    completed: number;
  }>(
    'SELECT id, weight, reps, completed FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY order_index',
    [newWes[0]!.id],
  );
  expect(newSets).toHaveLength(1);
  expect(newSets[0]!.weight).toBe(185);
  expect(newSets[0]!.reps).toBe(5);
  expect(newSets[0]!.completed).toBe(0); // not completed yet

  // The returned marker is the provenance handoff (task-1 / pendingSeedMarkers)
  // — it must point at the SAME row just inserted, with the SAME values, or a
  // resumed screen would mismatch it against the wrong set.
  expect(result!.markers).toEqual([
    { id: newSets[0]!.id, weight: 185, reps: 5, source: 'history' },
  ]);
});

test('repeatLastWorkout seeds no marker for an exercise with no completed history', async () => {
  // Previous workout has an exercise with a set that was never completed —
  // getLastFinishedWorkoutWithSeeds only reads completed sets, so this
  // exercise clones with an all-null seed and must get no marker (task-1 §2).
  const wPrev = await createWorkout({ userId: USER_ID, title: 'Push' });
  const { weId: we } = await addExerciseToWorkout({ workoutId: wPrev, exerciseId: EX_BENCH });
  await addSet(we); // left incomplete, no weight/reps
  await finishWorkout(wPrev);

  const result = await repeatLastWorkout(USER_ID);
  expect(result).not.toBeNull();
  expect(result!.markers).toEqual([]);

  const db = await getDb();
  const newSet = await db.getFirstAsync<{ weight: number | null; reps: number | null }>(
    `SELECT s.weight, s.reps FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
      WHERE we.workout_id = ?`,
    [result!.workoutId],
  );
  expect(newSet).toEqual({ weight: null, reps: null });
});

test('repeatLastWorkout is atomic — a mid-clone failure leaves no partial workout (#20)', async () => {
  // Source: two exercises, each with a completed set (→ two cloned sets).
  const wPrev = await createWorkout({ userId: USER_ID, title: 'Push' });
  const { weId: we1 } = await addExerciseToWorkout({ workoutId: wPrev, exerciseId: EX_BENCH });
  await updateSet(await addSet(we1), { weight: 100, reps: 5, completed: true });
  const { weId: we2 } = await addExerciseToWorkout({ workoutId: wPrev, exerciseId: EX_OHP });
  await updateSet(await addSet(we2), { weight: 60, reps: 5, completed: true });
  await finishWorkout(wPrev); // source becomes finished → no active workouts

  const db = await getDb();
  const realRun = db.runAsync.bind(db);
  let setInserts = 0;
  const spy = jest.spyOn(db, 'runAsync').mockImplementation((sql: string, params?: unknown) => {
    if (typeof sql === 'string' && sql.startsWith('INSERT INTO sets')) {
      setInserts += 1;
      if (setInserts === 2) throw new Error('boom mid-clone');
    }
    return realRun(sql, params as never);
  });

  await expect(repeatLastWorkout(USER_ID)).rejects.toThrow('boom');
  spy.mockRestore();

  // The whole clone must have rolled back — no half-built active workout remains.
  const active = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM workouts WHERE ended_at IS NULL AND deleted_at IS NULL`,
  );
  expect(active?.c).toBe(0);
});

test('repeatLastWorkout returns null when there is no last workout', async () => {
  const result = await repeatLastWorkout(USER_ID);
  expect(result).toBeNull();
});
