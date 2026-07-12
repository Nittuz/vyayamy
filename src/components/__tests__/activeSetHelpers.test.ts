import {
  findInitialCursor,
  findExercise,
  findPrevExercise,
  firstIncompleteSet,
  findSet,
  completedSetsBeforeCursor,
  type ExerciseShape,
} from '@/components/activeSet';

function ex(id: string, sets: { id: string; completed: boolean }[]): ExerciseShape {
  return {
    id,
    exerciseId: `e-${id}`,
    exerciseName: id,
    orderIndex: 0,
    sets: sets.map((s, i) => ({
      id: s.id,
      weId: id,
      orderIndex: i,
      weight: 100,
      reps: 5,
      units: 'kg' as const,
      completed: s.completed,
    })),
  };
}

describe('findInitialCursor', () => {
  test('points at the first incomplete set', () => {
    const exercises = [
      ex('a', [
        { id: 'a1', completed: true },
        { id: 'a2', completed: false },
      ]),
      ex('b', [{ id: 'b1', completed: false }]),
    ];
    expect(findInitialCursor(exercises)).toEqual({ weId: 'a', setId: 'a2' });
  });

  test('returns null when every set is complete (#15 — show the recap, never loop)', () => {
    // Returning a completed set here made the cursor-reset effect reposition onto
    // a completed set forever (infinite setState). null routes to the recap.
    const exercises = [
      ex('a', [
        { id: 'a1', completed: true },
        { id: 'a2', completed: true },
      ]),
    ];
    expect(findInitialCursor(exercises)).toBeNull();
  });

  test('returns null when no incomplete set exists across any exercise (#15)', () => {
    const exercises = [ex('empty', []), ex('a', [{ id: 'a1', completed: true }])];
    expect(findInitialCursor(exercises)).toBeNull();
  });

  test('returns null when there are no sets at all', () => {
    expect(findInitialCursor([ex('empty', [])])).toBeNull();
    expect(findInitialCursor([])).toBeNull();
  });
});

describe('findPrevExercise (#13)', () => {
  const exercises = [
    ex('a', [{ id: 'a1', completed: true }]),
    ex('b', [{ id: 'b1', completed: false }]),
    ex('c', [{ id: 'c1', completed: false }]),
  ];
  test('returns the exercise before the given one', () => {
    expect(findPrevExercise(exercises, 'c')!.id).toBe('b');
    expect(findPrevExercise(exercises, 'b')!.id).toBe('a');
  });
  test('returns null at the first exercise or for an unknown id', () => {
    expect(findPrevExercise(exercises, 'a')).toBeNull();
    expect(findPrevExercise(exercises, 'missing')).toBeNull();
  });
});

describe('firstIncompleteSet (#13)', () => {
  test('returns the first set that is not completed', () => {
    const e = ex('a', [
      { id: 'a1', completed: true },
      { id: 'a2', completed: false },
    ]);
    expect(firstIncompleteSet(e)!.id).toBe('a2');
  });
  test('returns null when every set is complete (caller stages a fresh one)', () => {
    const e = ex('a', [{ id: 'a1', completed: true }]);
    expect(firstIncompleteSet(e)).toBeNull();
  });
});

describe('findExercise', () => {
  const exercises = [
    ex('a', [{ id: 'a1', completed: false }]),
    ex('b', [{ id: 'b1', completed: false }]),
  ];

  test('returns the matching exercise', () => {
    expect(findExercise(exercises, 'b')!.id).toBe('b');
  });

  test('returns null when not found', () => {
    expect(findExercise(exercises, 'missing')).toBeNull();
  });
});

describe('findSet', () => {
  const exercise = ex('a', [
    { id: 'a1', completed: false },
    { id: 'a2', completed: true },
  ]);

  test('returns the matching set', () => {
    expect(findSet(exercise, 'a2')!.id).toBe('a2');
  });

  test('returns null when not found', () => {
    expect(findSet(exercise, 'nope')).toBeNull();
  });
});

describe('completedSetsBeforeCursor', () => {
  test('returns only COMPLETED sets before the cursor (#16 — no incomplete ghost shows a check)', () => {
    const exercise = ex('a', [
      { id: 'a1', completed: true },
      { id: 'a2', completed: false }, // skipped/incomplete — must NOT appear as a ghost
      { id: 'a3', completed: false },
    ]);
    const before = completedSetsBeforeCursor(exercise, { weId: 'a', setId: 'a3' });
    expect(before.map((s) => s.id)).toEqual(['a1']);
  });

  test('returns only completed sets when the cursor is in a different exercise', () => {
    const exercise = ex('a', [
      { id: 'a1', completed: true },
      { id: 'a2', completed: false },
    ]);
    const before = completedSetsBeforeCursor(exercise, { weId: 'other', setId: 'x' });
    expect(before.map((s) => s.id)).toEqual(['a1']);
  });

  test('returns completed sets when the cursor set is missing from the exercise', () => {
    const exercise = ex('a', [
      { id: 'a1', completed: true },
      { id: 'a2', completed: false },
    ]);
    const before = completedSetsBeforeCursor(exercise, { weId: 'a', setId: 'ghost' });
    expect(before.map((s) => s.id)).toEqual(['a1']);
  });
});
