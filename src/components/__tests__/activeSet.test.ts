import {
  findNextExercise,
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
      shouldConfirmLeavingSet(set({ id: 's2', weight: 600, reps: 9 }), { id: 's1', weight: 600, reps: 9 }),
    ).toBe(true);
  });
});
