import { getDb, initDb, resetDbForTests } from '@/db/client';
import {
  getGroupedPRs,
  getHeaviestWeightHistory,
  getBestSetVolumeHistory,
  getMostRepsHistory,
  recomputeAllPRs,
  recordWorkoutPRs,
} from '@/queries/personalRecords';
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
    await insertPR({
      id: 'pr1',
      exerciseId: 'ex-bench',
      type: 'heaviest_weight',
      value: 225,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'pr2',
      exerciseId: 'ex-bench',
      type: 'most_reps',
      value: { reps: 12, weight: 100 },
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'pr3',
      exerciseId: 'ex-squat',
      type: 'heaviest_weight',
      value: 315,
      achievedAt: oldIso(),
    });

    const groups = await getGroupedPRs(USER);

    expect(groups.map((g) => g.exerciseName)).toEqual(['Back Squat', 'Bench Press']);
    const bench = groups.find((g) => g.exerciseId === 'ex-bench')!;
    expect(bench.records).toHaveLength(2);
    expect(bench.muscleGroup).toBe('Chest');
  });

  test('formats display values per PR type, including bodyweight rep records', async () => {
    await insertExercise('ex-dl', 'Deadlift', 'Back');
    await insertExercise('ex-pu', 'Pull-up', 'Back');
    await insertPR({
      id: 'a',
      exerciseId: 'ex-dl',
      type: 'heaviest_weight',
      value: 405,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'b',
      exerciseId: 'ex-dl',
      type: 'most_reps',
      value: { reps: 12, weight: 100 },
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'c',
      exerciseId: 'ex-pu',
      type: 'most_reps',
      value: { reps: 15, weight: null },
      achievedAt: oldIso(),
    });

    const groups = await getGroupedPRs(USER);
    const dl = groups.find((g) => g.exerciseId === 'ex-dl')!;
    const byType = Object.fromEntries(dl.records.map((r) => [r.type, r.displayValue]));
    expect(byType.heaviest_weight).toBe('405');
    expect(byType.most_reps).toBe('12 × 100 kg');
    const pu = groups.find((g) => g.exerciseId === 'ex-pu')!;
    expect(pu.records[0]!.displayValue).toBe('15 BW');
  });

  test('orders each exercise’s records heaviest-first regardless of achieved_at', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    // The rep record is newer — SQL recency order would put it first.
    await insertPR({
      id: 'reps',
      exerciseId: 'ex',
      type: 'most_reps',
      value: { reps: 10, weight: 80 },
      achievedAt: recentIso(),
    });
    await insertPR({
      id: 'heavy',
      exerciseId: 'ex',
      type: 'heaviest_weight',
      value: 100,
      achievedAt: oldIso(),
    });

    const [group] = await getGroupedPRs(USER);
    expect(group!.records.map((r) => r.type)).toEqual(['heaviest_weight', 'most_reps']);
  });

  test('excludes rows of retired record types', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await insertPR({
      id: 'live',
      exerciseId: 'ex',
      type: 'heaviest_weight',
      value: 100,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'stale-vol',
      exerciseId: 'ex',
      type: 'best_volume',
      value: 4500,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'stale-raw',
      exerciseId: 'ex',
      type: 'most_reps_at_weight',
      value: { weight: 100, reps: 12 },
      achievedAt: oldIso(),
    });

    const [group] = await getGroupedPRs(USER);
    expect(group!.records.map((r) => r.id)).toEqual(['live']);
  });

  test('flags records achieved within the last 7 days as recent', async () => {
    await insertExercise('ex', 'Press', 'Shoulders');
    await insertPR({
      id: 'recent',
      exerciseId: 'ex',
      type: 'heaviest_weight',
      value: 100,
      achievedAt: recentIso(),
    });
    await insertPR({
      id: 'old',
      exerciseId: 'ex',
      type: 'most_reps',
      value: { reps: 5, weight: 100 },
      achievedAt: oldIso(),
    });

    const [group] = await getGroupedPRs(USER);
    expect(group!.hasRecent).toBe(true);
    expect(group!.records.find((r) => r.id === 'recent')!.isRecent).toBe(true);
    expect(group!.records.find((r) => r.id === 'old')!.isRecent).toBe(false);
  });

  test('falls back to "Unknown" when the exercise row is missing', async () => {
    await insertPR({
      id: 'pr',
      exerciseId: 'ghost',
      type: 'heaviest_weight',
      value: 100,
      achievedAt: oldIso(),
    });
    const [group] = await getGroupedPRs(USER);
    expect(group!.exerciseName).toBe('Unknown');
    expect(group!.muscleGroup).toBeNull();
  });

  test('excludes soft-deleted records', async () => {
    await insertExercise('ex', 'Row', 'Back');
    await insertPR({
      id: 'live',
      exerciseId: 'ex',
      type: 'heaviest_weight',
      value: 100,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'dead',
      exerciseId: 'ex',
      type: 'most_reps',
      value: { reps: 5, weight: 100 },
      achievedAt: oldIso(),
      deleted: true,
    });

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
    // PRs only count sets from FINISHED workouts (#143), so seed ended_at.
    await db.runAsync(
      'INSERT INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [workoutId, USER, T, T, 'W', T, T],
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

  test('creates heaviest and most-reps PRs from a finished workout — and no volume record', async () => {
    await insertExercise('ex-dl', 'Deadlift', 'Back');
    await seedWorkout('w1', 'we1', 'ex-dl', [
      { weight: 140, reps: 5, completed: true }, // heaviest 140
      { weight: 100, reps: 10, completed: true }, // most reps 10 @ 100
      { weight: 999, reps: 1, completed: false }, // incomplete — ignored
    ]);

    await recordWorkoutPRs(USER, 'w1');

    const [group] = await getGroupedPRs(USER);
    expect(group!.records).toHaveLength(2);
    const byType = Object.fromEntries(group!.records.map((r) => [r.type, r.displayValue]));
    expect(byType.heaviest_weight).toBe('140');
    expect(byType.most_reps).toBe('10 × 100 kg');
  });

  test('a bodyweight-only workout earns a rep record', async () => {
    await insertExercise('ex-pu', 'Pull-up', 'Back');
    await seedWorkout('w-bw', 'we-bw', 'ex-pu', [
      { weight: null, reps: 12, completed: true },
      { weight: null, reps: 15, completed: true },
    ]);

    await recordWorkoutPRs(USER, 'w-bw');

    const [group] = await getGroupedPRs(USER);
    expect(group!.records.map((r) => [r.type, r.displayValue])).toEqual([['most_reps', '15 BW']]);
  });

  test('recompute hard-deletes cached rows of retired types (best_volume, most_reps_at_weight)', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await insertPR({
      id: 'stale-vol',
      exerciseId: 'ex',
      type: 'best_volume',
      value: 4500,
      achievedAt: oldIso(),
    });
    await insertPR({
      id: 'stale-raw',
      exerciseId: 'ex',
      type: 'most_reps_at_weight',
      value: { weight: 100, reps: 12 },
      achievedAt: oldIso(),
    });
    await seedWorkout('w', 'we', 'ex', [{ weight: 100, reps: 5, completed: true }]);

    await recordWorkoutPRs(USER, 'w');

    const db = await getDb();
    const stale = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM personal_records WHERE type IN ('best_volume', 'most_reps_at_weight')`,
    );
    expect(stale?.c).toBe(0);
  });

  test('recomputeAllPRs sweeps retired-type rows even for exercises with no remaining sets', async () => {
    await insertExercise('ex-ghost', 'Ghost', null);
    await insertPR({
      id: 'orphan',
      exerciseId: 'ex-ghost',
      type: 'best_volume',
      value: 1000,
      achievedAt: oldIso(),
    });

    await recomputeAllPRs(USER);

    const db = await getDb();
    const stale = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM personal_records WHERE type = 'best_volume'`,
    );
    expect(stale?.c).toBe(0);
  });

  test('PRs are a LOCAL cache — recording them never enqueues a sync op (#138/#139)', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedWorkout('w', 'we', 'ex', [{ weight: 100, reps: 5, completed: true }]);

    await recordWorkoutPRs(USER, 'w');

    const db = await getDb();
    const prOutbox = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM outbox WHERE table_name = 'personal_records'`,
    );
    expect(prOutbox?.c).toBe(0);
    // ...but the local cache was written.
    const prCount = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM personal_records',
    );
    expect(prCount!.c).toBeGreaterThan(0);
  });

  test('reflects the best across all finished history, not just the latest workout', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedWorkout('w-heavy', 'we-h', 'ex', [{ weight: 200, reps: 3, completed: true }]);
    await seedWorkout('w-light', 'we-l', 'ex', [{ weight: 150, reps: 5, completed: true }]);

    await recordWorkoutPRs(USER, 'w-heavy');
    await recordWorkoutPRs(USER, 'w-light'); // authoritative recompute sees both

    const [group] = await getGroupedPRs(USER);
    // The heavier set still owns the PR — the lighter workout did not downgrade it.
    expect(group!.records.find((r) => r.type === 'heaviest_weight')!.displayValue).toBe('200');
  });

  test('drops a PR when its backing set is deleted (authoritative down-write, #138)', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedWorkout('w', 'we', 'ex', [
      { weight: 200, reps: 3, completed: true }, // the PR
      { weight: 150, reps: 5, completed: true }, // the next-best
    ]);
    await recordWorkoutPRs(USER, 'w');
    expect(
      (await getGroupedPRs(USER))[0]!.records.find((r) => r.type === 'heaviest_weight')!
        .displayValue,
    ).toBe('200');

    // Soft-delete the 200 set, then recompute: the phantom PR must drop to 150.
    const db = await getDb();
    await db.runAsync(`UPDATE sets SET deleted_at = ? WHERE id = 'we-s0'`, [T]);
    await recordWorkoutPRs(USER, 'w');

    expect(
      (await getGroupedPRs(USER))[0]!.records.find((r) => r.type === 'heaviest_weight')!
        .displayValue,
    ).toBe('150');
  });
});

describe('chart history series', () => {
  async function seedSet(args: {
    setId: string;
    exerciseId: string;
    weight: number | null;
    completed: boolean;
    completedAt: string | null;
    deleted?: boolean;
    reps?: number | null;
    finished?: boolean;
  }) {
    const db = await getDb();
    const wId = `w-${args.setId}`;
    const weId = `we-${args.setId}`;
    // Chart series must agree with the records, so only FINISHED workouts count;
    // pass finished: false to model an in-progress session.
    await db.runAsync(
      'INSERT OR IGNORE INTO workouts (id, user_id, started_at, ended_at, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [wId, USER, T, args.finished === false ? null : T, 'W', T, T],
    );
    await db.runAsync(
      'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [weId, wId, args.exerciseId, 0, T, T],
    );
    await db.runAsync(
      `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.setId,
        weId,
        0,
        args.weight,
        args.reps === undefined ? 5 : args.reps,
        args.completed ? 1 : 0,
        args.completedAt,
        T,
        T,
        args.deleted ? T : null,
      ],
    );
  }

  test('returns the per-day maximum completed weight, sorted ascending', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({
      setId: 's1',
      exerciseId: 'ex',
      weight: 100,
      completed: true,
      completedAt: '2026-02-01T10:00:00.000Z',
    });
    await seedSet({
      setId: 's2',
      exerciseId: 'ex',
      weight: 120,
      completed: true,
      completedAt: '2026-02-01T11:00:00.000Z',
    });
    await seedSet({
      setId: 's3',
      exerciseId: 'ex',
      weight: 110,
      completed: true,
      completedAt: '2026-02-03T10:00:00.000Z',
    });

    const points = await getHeaviestWeightHistory(USER, 'ex');
    expect(points).toEqual([
      { achievedAt: '2026-02-01', weight: 120 },
      { achievedAt: '2026-02-03', weight: 110 },
    ]);
  });

  test('ignores incomplete, deleted, and null-weight sets', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({
      setId: 'incomplete',
      exerciseId: 'ex',
      weight: 200,
      completed: false,
      completedAt: null,
    });
    await seedSet({
      setId: 'deleted',
      exerciseId: 'ex',
      weight: 300,
      completed: true,
      completedAt: '2026-02-05T10:00:00.000Z',
      deleted: true,
    });
    await seedSet({
      setId: 'nullw',
      exerciseId: 'ex',
      weight: null,
      completed: true,
      completedAt: '2026-02-05T10:00:00.000Z',
    });
    await seedSet({
      setId: 'good',
      exerciseId: 'ex',
      weight: 150,
      completed: true,
      completedAt: '2026-02-06T10:00:00.000Z',
    });

    const points = await getHeaviestWeightHistory(USER, 'ex');
    expect(points).toEqual([{ achievedAt: '2026-02-06', weight: 150 }]);
  });

  test('excludes sets from in-progress workouts so the chart peak matches the records', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({
      setId: 'done',
      exerciseId: 'ex',
      weight: 100,
      completed: true,
      completedAt: '2026-02-01T10:00:00.000Z',
    });
    await seedSet({
      setId: 'live',
      exerciseId: 'ex',
      weight: 180,
      completed: true,
      completedAt: '2026-02-02T10:00:00.000Z',
      finished: false,
    });

    expect(await getHeaviestWeightHistory(USER, 'ex')).toEqual([
      { achievedAt: '2026-02-01', weight: 100 },
    ]);
    expect(await getBestSetVolumeHistory(USER, 'ex')).toEqual([
      { achievedAt: '2026-02-01', volume: 500 },
    ]);
  });

  test('reps series returns the per-day best set reps, bodyweight sets included', async () => {
    await insertExercise('ex', 'Pull-up', 'Back');
    await seedSet({
      setId: 'r1',
      exerciseId: 'ex',
      weight: null,
      reps: 12,
      completed: true,
      completedAt: '2026-02-01T10:00:00.000Z',
    });
    await seedSet({
      setId: 'r2',
      exerciseId: 'ex',
      weight: 10, // loaded sets count toward the reps series too
      reps: 15,
      completed: true,
      completedAt: '2026-02-01T11:00:00.000Z',
    });
    await seedSet({
      setId: 'r3',
      exerciseId: 'ex',
      weight: null,
      reps: 9,
      completed: true,
      completedAt: '2026-02-03T10:00:00.000Z',
    });
    await seedSet({
      setId: 'r4',
      exerciseId: 'ex',
      weight: null,
      reps: 20,
      completed: true,
      completedAt: '2026-02-04T10:00:00.000Z',
      finished: false, // in-progress workouts stay off the chart
    });

    expect(await getMostRepsHistory(USER, 'ex')).toEqual([
      { achievedAt: '2026-02-01', reps: 15 },
      { achievedAt: '2026-02-03', reps: 9 },
    ]);
  });

  test('volume series returns the per-day best set volume', async () => {
    await insertExercise('ex', 'Bench', 'Chest');
    await seedSet({
      setId: 'v1',
      exerciseId: 'ex',
      weight: 100,
      reps: 5, // 500
      completed: true,
      completedAt: '2026-02-01T10:00:00.000Z',
    });
    await seedSet({
      setId: 'v2',
      exerciseId: 'ex',
      weight: 80,
      reps: 10, // 800 — the day's best single set
      completed: true,
      completedAt: '2026-02-01T11:00:00.000Z',
    });

    expect(await getBestSetVolumeHistory(USER, 'ex')).toEqual([
      { achievedAt: '2026-02-01', volume: 800 },
    ]);
  });
});
