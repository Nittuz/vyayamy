import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { listSetsForWorkoutExercise } from '@/queries/sets';
import { setSyncState } from '@/sync/state';
import { dispatchCommand, type DispatchContext } from '@/voice/dispatch';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'voice-user';
const T = '2026-01-01T00:00:00.000Z';

async function seedExercise(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, 'Chest', null, T, T],
  );
}

async function setup(): Promise<DispatchContext> {
  const workoutId = await createWorkout({ userId: USER, title: 'Push' });
  const { weId } = await addExerciseToWorkout({ workoutId, exerciseId: 'ex' });
  const sets = await listSetsForWorkoutExercise(weId); // auto-staged set 0
  return { userId: USER, workoutId, activeWeId: weId, activeSetId: sets[0]!.id, units: 'lb' };
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
  await seedExercise('ex', 'Bench Press');
});

test('setValues writes weight and reps to the active set', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'setValues', weight: 185, reps: 5 }, ctx);
  expect(res.ok).toBe(true);
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBe(185);
  expect(sets[0]!.reps).toBe(5);
});

test('setValues stamps the spoken unit, overriding the profile unit (#133)', async () => {
  const ctx = await setup(); // ctx.units = 'lb'
  // "100 kilos for 5" under an lb profile must record kg, not lb.
  await dispatchCommand({ kind: 'setValues', weight: 100, reps: 5, unit: 'kg' }, ctx);
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBe(100);
  expect(sets[0]!.units).toBe('kg');
});

test('setValues with no spoken unit falls back to the profile unit', async () => {
  const ctx = await setup(); // ctx.units = 'lb'
  await dispatchCommand({ kind: 'setValues', weight: 185, reps: 5 }, ctx);
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.units).toBe('lb');
});

test('setValues undo restores prior values', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'setValues', weight: 185, reps: 5 }, ctx);
  await res.undo!();
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBeNull();
  expect(sets[0]!.reps).toBeNull();
});

test('completeSet marks the active set completed; undo reverts', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'completeSet' }, ctx);
  let sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(Boolean(sets[0]!.completed)).toBe(true);
  await res.undo!();
  sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(Boolean(sets[0]!.completed)).toBe(false);
});

test('addSet stages another set; undo removes it', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addSet' }, ctx);
  let sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets).toHaveLength(2);
  await res.undo!();
  sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets).toHaveLength(1);
});

test('addExercise reuses an existing catalog match', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addExercise', name: 'Bench Press' }, ctx);
  expect(res.ok).toBe(true);
  const db = await getDb();
  const count = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM exercises WHERE name = 'Bench Press'",
  );
  expect(count!.n).toBe(1); // reused, not duplicated
});

test('addExercise creates a custom exercise when no match exists', async () => {
  const ctx = await setup();
  const res = await dispatchCommand({ kind: 'addExercise', name: 'Zercher Squat' }, ctx);
  expect(res.ok).toBe(true);
  const db = await getDb();
  const row = await db.getFirstAsync<{ user_id: string }>(
    "SELECT user_id FROM exercises WHERE name = 'Zercher Squat'",
  );
  expect(row!.user_id).toBe(USER);
});

test('setValues clamps an unbounded misheard weight to the keypad max (#19/#137)', async () => {
  const ctx = await setup();
  await dispatchCommand({ kind: 'setValues', weight: 9999, reps: 5 }, ctx);
  const sets = await listSetsForWorkoutExercise(ctx.activeWeId!);
  expect(sets[0]!.weight).toBe(1500);
});

test('setValues with no active set is a no-op failure', async () => {
  const ctx = await setup();
  const res = await dispatchCommand(
    { kind: 'setValues', weight: 185 },
    { ...ctx, activeSetId: null },
  );
  expect(res.ok).toBe(false);
});
