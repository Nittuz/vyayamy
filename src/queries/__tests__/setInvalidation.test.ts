/**
 * Regression guard for deep-review finding #11:
 *   "Set writes never refresh the active screen's query — offline, the workout
 *    UI freezes (stepper dead, infinite spinner after every completed set)."
 *
 * WorkoutActive (and HistoryDetail) render from the composite workout-detail
 * query (`['workouts','detail',id]`), but set mutations historically invalidated
 * only `['sets', weId]` — a key nothing reads. The screen therefore refreshed
 * ONLY when a network push happened to land (triggerPush → invalidateAfterSync);
 * offline, triggerPush short-circuits and the screen never re-read SQLite.
 *
 * These tests pin the invalidation contract so a set write refreshes the
 * detail query WITHOUT any network round-trip. They run headless against a real
 * QueryClient/QueryObserver + the better-sqlite3 engine — no RN renderer needed.
 */
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { getDb, initDb, resetDbForTests } from '@/db/client';
import { uuidv4 } from '@/db/uuid';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet } from '@/queries/sets';
import { createWorkout } from '@/queries/workouts';
import { getWorkoutDetail, type WorkoutDetail } from '@/queries/workoutDetail';
import { setSyncState } from '@/sync/state';

import { queryKeys, setWriteInvalidationKeys } from '../keys';

// Sync is offline in these tests, so the client is never called — stub it to
// avoid loading the real supabase.ts (which imports ESM-only expo-constants).
jest.mock('@/auth/supabase', () => ({
  supabase: {
    from: () => ({}),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

const USER_ID = 'user-invalidation-test';

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function seedIncompleteSet(): Promise<{ workoutId: string; weId: string; setId: string }> {
  const db = await getDb();
  const exerciseId = uuidv4();
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    [exerciseId, 'Bench Press', 'Chest', new Date().toISOString(), new Date().toISOString()],
  );
  const workoutId = await createWorkout({ userId: USER_ID, title: 'Push day' });
  const weId = await addExerciseToWorkout({ workoutId, exerciseId });
  const setId = await addSet(weId, { weight: 60, reps: 10 });
  return { workoutId, weId, setId };
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  // The whole point: offline. triggerPush is a no-op here, so the ONLY thing
  // that can refresh the screen is the mutation's own local invalidation.
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

test('a set write invalidates the workout-detail query (offline screen refresh)', async () => {
  const { workoutId, weId, setId } = await seedIncompleteSet();

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observer = new QueryObserver<WorkoutDetail>(qc, {
    queryKey: queryKeys.workouts.withExercises(workoutId),
    queryFn: () => getWorkoutDetail(workoutId),
  });
  const unsubscribe = observer.subscribe(() => {});

  try {
    await waitFor(() => observer.getCurrentResult().data != null);
    const before = observer.getCurrentResult().data!;
    expect(before.exercises[0]!.sets.find((s) => s.id === setId)!.completed).toBe(false);

    // Commit the set completion to SQLite (offline) and run exactly the
    // invalidation the mutation hooks perform.
    await updateSet(setId, { completed: true });
    for (const key of setWriteInvalidationKeys(weId)) {
      await qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
    }

    // With the detail key in the contract, the observer refetches from SQLite
    // and reflects the completion. With the old `['sets', weId]`-only contract
    // this times out, because that key matches no mounted query.
    await waitFor(
      () =>
        observer.getCurrentResult().data?.exercises[0]?.sets.find((s) => s.id === setId)
          ?.completed === true,
    );
  } finally {
    unsubscribe();
  }
});

test('the set-write invalidation contract includes both the sets list and the detail query', () => {
  const keys = setWriteInvalidationKeys('we-123');
  expect(keys).toContainEqual(['sets', 'we-123']);
  // #11: the composite query WorkoutActive/HistoryDetail render from.
  expect(keys).toContainEqual(['workouts', 'detail']);
});
