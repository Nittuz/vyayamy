import {
  countIncompleteSets,
  findNextExercise,
  setRowToShape,
  shouldConfirmLeavingSet,
  type AutoStagedSet,
  type ExerciseShape,
  type SetShape,
} from '@/components/activeSet';

const set = (over: Partial<SetShape> = {}): SetShape => ({
  id: 's1',
  weId: 'we1',
  orderIndex: 0,
  weight: 600,
  reps: 9,
  units: 'kg',
  completed: false,
  ...over,
});

// advanceCursor and its tests were deleted (#21/#77): it was dead code whose
// pre-declared-sets progression model diverged from the shipped flow, which
// auto-stages a new set in the same exercise on completion and repositions a
// stale cursor via findInitialCursor. The real logic is pinned in
// activeSetCursor.test.ts (resolveCursor / planStagedSet).

const exWithGroup = (id: string, group: string | null, setIds: string[] = []): ExerciseShape => ({
  id,
  exerciseId: `ex-${id}`,
  exerciseName: `Exercise ${id}`,
  orderIndex: 0,
  muscleGroup: group,
  sets: setIds.map((sid, i) => ({
    id: sid,
    weId: id,
    orderIndex: i,
    weight: 100,
    reps: 5,
    units: 'kg' as const,
    completed: false,
  })),
});

describe('findNextExercise', () => {
  test('returns next exercise', () => {
    const exercises = [exWithGroup('we1', 'Chest'), exWithGroup('we2', 'Back')];
    expect(findNextExercise(exercises, 'we1')).toEqual(exercises[1]);
  });
  test('returns null when on last exercise', () => {
    const exercises = [exWithGroup('we1', 'Chest')];
    expect(findNextExercise(exercises, 'we1')).toBeNull();
  });
  test('returns null when current weId is not found', () => {
    const exercises = [exWithGroup('we1', 'Chest')];
    expect(findNextExercise(exercises, 'ghost')).toBeNull();
  });
  test('skips no exercises (all returned)', () => {
    const exercises = [
      exWithGroup('we1', 'Chest'),
      exWithGroup('we2', 'Back'),
      exWithGroup('we3', 'Legs'),
    ];
    expect(findNextExercise(exercises, 'we1')?.id).toBe('we2');
    expect(findNextExercise(exercises, 'we2')?.id).toBe('we3');
    expect(findNextExercise(exercises, 'we3')).toBeNull();
  });
});

describe('ExerciseShape includes muscleGroup', () => {
  test('muscleGroup field is part of the shape', () => {
    const e = exWithGroup('we1', 'Chest');
    expect(e.muscleGroup).toBe('Chest');
  });
  test('muscleGroup can be null', () => {
    const e = exWithGroup('we1', null);
    expect(e.muscleGroup).toBeNull();
  });
});

describe('shouldConfirmLeavingSet', () => {
  const staged: AutoStagedSet = { id: 's1', weight: 600, reps: 9 };

  test('no warning for a null set', () => {
    expect(shouldConfirmLeavingSet(null, staged)).toBe(false);
  });

  test('no warning for an already-completed set', () => {
    expect(shouldConfirmLeavingSet(set({ completed: true }), null)).toBe(false);
  });

  test('no warning for an empty set (no weight, no reps)', () => {
    expect(shouldConfirmLeavingSet(set({ weight: null, reps: null }), null)).toBe(false);
  });

  test('no warning for the untouched auto-staged set (the common finish case)', () => {
    // Completing set 3 pre-fills set 4 with 600 × 9; tapping finish must not prompt.
    expect(shouldConfirmLeavingSet(set({ id: 's1', weight: 600, reps: 9 }), staged)).toBe(false);
  });

  test('warns once the user edits the staged weight', () => {
    expect(shouldConfirmLeavingSet(set({ id: 's1', weight: 605, reps: 9 }), staged)).toBe(true);
  });

  test('warns once the user edits the staged reps', () => {
    expect(shouldConfirmLeavingSet(set({ id: 's1', weight: 600, reps: 10 }), staged)).toBe(true);
  });

  test('warns for a non-empty set that was never auto-staged', () => {
    expect(shouldConfirmLeavingSet(set({ id: 's7', weight: 600, reps: 9 }), null)).toBe(true);
  });

  test('warns when the staged ref points at a different set', () => {
    expect(
      shouldConfirmLeavingSet(set({ id: 's2', weight: 600, reps: 9 }), {
        id: 's1',
        weight: 600,
        reps: 9,
      }),
    ).toBe(true);
  });
});

describe('setRowToShape', () => {
  it('maps DB row fields to sheet shape', () => {
    const shape = setRowToShape({
      id: 's1',
      workout_exercise_id: 'we1',
      order_index: 2,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: true,
    } as never);
    expect(shape).toEqual({
      id: 's1',
      weId: 'we1',
      orderIndex: 2,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: true,
    });
  });

  it('coerces a raw sqlite 0/1 to a strict boolean, not a passthrough', () => {
    const zero = setRowToShape({
      id: 's2',
      workout_exercise_id: 'we1',
      order_index: 0,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: 0,
    } as never);
    // toBe (Object.is) — a regression to `completed: s.completed` would leave
    // this `0`, which is loosely-equal-false but not strictly `false`.
    expect(zero.completed).toBe(false);

    const one = setRowToShape({
      id: 's3',
      workout_exercise_id: 'we1',
      order_index: 0,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: 1,
    } as never);
    expect(one.completed).toBe(true);
  });

  it('leaves null weight/reps unmapped', () => {
    const shape = setRowToShape({
      id: 's4',
      workout_exercise_id: 'we1',
      order_index: 0,
      weight: null,
      reps: null,
      units: null,
      completed: false,
    } as never);
    expect(shape.weight).toBeNull();
    expect(shape.reps).toBeNull();
  });
});

describe('countIncompleteSets', () => {
  it('counts only incomplete sets across exercises', () => {
    const ex = (sets: Partial<SetShape>[]): ExerciseShape =>
      ({ id: 'we', exerciseId: 'e', exerciseName: 'X', orderIndex: 0, sets }) as never;
    expect(
      countIncompleteSets([
        ex([{ completed: true }, { completed: false }]),
        ex([{ completed: false }]),
      ]),
    ).toBe(2);
    expect(countIncompleteSets([ex([{ completed: true }])])).toBe(0);
    expect(countIncompleteSets([])).toBe(0);
  });
});
