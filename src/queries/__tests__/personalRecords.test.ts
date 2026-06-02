import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getGroupedPRs, getHeaviestWeightHistory, recordWorkoutPRs } from '@/queries/personalRecords';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'pr-user';
const T = '2026-01-01T00:00:00.000Z';

const recentIso = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const oldIso = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

async function insertExercise(id: string, name: string, muscle: string | null) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, muscle, null, T, T],
  );
}

async function insertPR(args: {
  id: string;
  exerciseId: string;
  type: string;
  value: unknown;
  achievedAt: string;
  deleted?: boolean;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO personal_records (id, user_id, exercise_id, type, value, achieved_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.id,
      USER,
      args.exerciseId,
      args.type,
      JSON.stringify(args.value),
      args.achievedAt,
      T,
      T,
      args.deleted ? T : null,
    ],
  );
}

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

describe('getGroupedPRs', () => {
  test('groups records per exercise and sorts groups by exercise name', async () => {
    await insertExercise('ex-bench', 'Bench Press', 'Chest');
    await insertExercise('ex-squat', 'Back Squat', 'Legs');
    await insertPR({ id: 'pr1', exerciseId: 'ex-bench', type: 'heaviest_weight', value: 225, achievedAt: oldIso() });
    await insertPR({ id: 'pr2', exerciseId: 'ex-bench', type: 'best_volume', value: 4500, achievedAt: oldIso() });
    await insertPR({ id: 'pr3', exerciseId: 'ex-squat', type: 'heaviest_weight', value: 315, achievedAt: oldIso() });

    const groups = await getGroupedPRs(USER);

    expect(groups.map((g) => g.exerciseName)).toEqual(['Back Squat', 'Bench Press']);
    const bench = groups.find((g) => g.exerciseId === 'ex-bench')!;
    expect(bench.records).toHaveLength(2);
    expect(bench.muscleGroup).toBe('Chest');
  });

  test('formats display values per PR type', async () => {
    await insertExercise('ex', 'Deadlift', 'Back');
    await insertPR({ id: 'a', exerciseId: 'ex', type: 'heaviest_weight', value: 405, achievedAt: oldIso() });
    await insertPR({ id: 'b', exerciseId: 'ex', type: 'best_volume', value: 6000, achievedAt: oldIso() });
    await insertPR({
      id: 'c',
      exerciseId: 'ex',
      type: 'most_reps_at_weight',
      value: { weight: 100, reps: 12 },
      achievedAt: oldIso(),
    });

    const [group] = await getGroupedPRs(USER);
    const byType = Object.fromEntries(group!.records.map((r) => [r.type, r.displayValue]));
    expect(byType.heaviest_weight).toBe('405');
    expect(byType.best_volume).toBe('6000');
    expect(byType.most_reps_at_weight).toBe('12 × 100');
  });

  test('flags records achieved within the last 7 days as recent', async () => {
    await insertExercise('ex', 'Press', 'Shoulders');
    await insertPR({ id: 'recent', exerciseId: 'ex', type: 'heaviest_weight', value: 100, achievedAt: recentIso() });
    await insertPR({ id: 'old', exerciseId: 'ex', type: 'best_volume', value: 100, achievedAt: oldIso() });

    const [group] = await getGroupedPRs(USER);
    expect(group!.hasRecent).toBe(true);
    expect(group!.records.find((r) => r.id === 'recent')!.isRecent).toBe(true);
    expect(group!.records.find((r) => r.id === 'old')!.isRecent).toBe(false);
  });

  test('falls back to "Unknown" when the exercise row is missing', async () => {
    await insertPR({ id: 'pr', exerciseId: 'ghost', type: 'heaviest_weight', value: 100, achievedAt: oldIso() });
    const [group] = await getGroupedPRs(USER);
    expect(group!.exerciseName).toBe('Unknown');
    expect(group!.muscleGroup).toBeNull();
  });

  test('excludes soft-deleted records', async () => {
    await insertExercise('ex', 'Row', 'Back');
    await insertPR({ id: 'live', exerciseId: 'ex', type: 'heaviest_weight', value: 100, achievedAt: oldIso() });
    await insertPR({ id: 'dead', exerciseId: 'ex', type: 'best_volume', value: 100, achievedAt: oldIso(), deleted: true });

    const [group] = await getGroupedPRs(USER);
    expect(group!.records.map((r) => r.id)).toEqual(['live']);
  });
});

describe('recordWorkoutPRs', () => {
  async function seedWorkout(
    workoutId: string,
    weId: string,
    exerciseId: string,
    sets: { weight: number | null; reps: number | null; completed: boolean }[],
  ) {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [workoutId, USER, T, 'W', T, T],
    );
    await db.runAsync(
      'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [weId, workoutId, exerciseId, 0, T, T],
    );
    let i = 0;
    for (const s of sets) {
      await db.runAsync(
        `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${weId}-s${i}`, weId, i, s.weight, s.reps, s.completed ? 1 : 0, T, T, T],
      );
      i++;
    }
  }

  test('creates heaviest/volume/most-reps PRs from a finished workout', async () => {
    await insertExercise('ex-dl', 'Deadlift', 'Back');
    await seedWorkout('w1', 'we1', 'ex-dl', [
      { weight: 140, reps: 5, completed: true }, // heaviest 140
      { weight: 100, reps: 10, completed: true }, // best volume 1000, most reps 10@100
      { weight: 999, reps: 1, completed: false }, // incomplete — ignored
    ]);

    await recordWorkoutPRs(USER, 'w1');

    const [group] = await getGroupedPRs(USER);
    const byType = Object.fromEntries(group!.records.map((r) => [r.type, r.displayValue]));
    expect(byType.heaviest_weight).toBe('140');
    expect(byType.best_volume).toBe('1000');
    expect(byType.most_reps_at_weight).toBe('10 × 100');
  });

  test('does not downgrade an existing heavier PR', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await insertPR({ id: 'pr-h', exerciseId: 'ex', type: 'heaviest_weight', value: 200, achievedAt: oldIso() });
    await seedWorkout('w2', 'we2', 'ex', [{ weight: 150, reps: 5, completed: true }]);

    await recordWorkoutPRs(USER, 'w2');

    const [group] = await getGroupedPRs(USER);
    expect(group!.records.find((r) => r.type === 'heaviest_weight')!.displayValue).toBe('200');
  });
});

describe('getHeaviestWeightHistory', () => {
  async function seedSet(args: {
    setId: string;
    exerciseId: string;
    weight: number | null;
    completed: boolean;
    completedAt: string | null;
    deleted?: boolean;
  }) {
    const db = await getDb();
    const wId = `w-${args.setId}`;
    const weId = `we-${args.setId}`;
    await db.runAsync(
      'INSERT OR IGNORE INTO workouts (id, user_id, started_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [wId, USER, T, 'W', T, T],
    );
    await db.runAsync(
      'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [weId, wId, args.exerciseId, 0, T, T],
    );
    await db.runAsync(
      `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [args.setId, weId, 0, args.weight, 5, args.completed ? 1 : 0, args.completedAt, T, T, args.deleted ? T : null],
    );
  }

  test('returns the per-day maximum completed weight, sorted ascending', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({ setId: 's1', exerciseId: 'ex', weight: 100, completed: true, completedAt: '2026-02-01T10:00:00.000Z' });
    await seedSet({ setId: 's2', exerciseId: 'ex', weight: 120, completed: true, completedAt: '2026-02-01T11:00:00.000Z' });
    await seedSet({ setId: 's3', exerciseId: 'ex', weight: 110, completed: true, completedAt: '2026-02-03T10:00:00.000Z' });

    const points = await getHeaviestWeightHistory(USER, 'ex');
    expect(points).toEqual([
      { achievedAt: '2026-02-01', weight: 120 },
      { achievedAt: '2026-02-03', weight: 110 },
    ]);
  });

  test('ignores incomplete, deleted, and null-weight sets', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({ setId: 'incomplete', exerciseId: 'ex', weight: 200, completed: false, completedAt: null });
    await seedSet({ setId: 'deleted', exerciseId: 'ex', weight: 300, completed: true, completedAt: '2026-02-05T10:00:00.000Z', deleted: true });
    await seedSet({ setId: 'nullw', exerciseId: 'ex', weight: null, completed: true, completedAt: '2026-02-05T10:00:00.000Z' });
    await seedSet({ setId: 'good', exerciseId: 'ex', weight: 150, completed: true, completedAt: '2026-02-06T10:00:00.000Z' });

    const points = await getHeaviestWeightHistory(USER, 'ex');
    expect(points).toEqual([{ achievedAt: '2026-02-06', weight: 150 }]);
  });
});
