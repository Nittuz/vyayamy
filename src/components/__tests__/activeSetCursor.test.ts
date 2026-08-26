/**
 * Characterization tests for the REAL cursor logic that shipped inline in
 * WorkoutActive (#21/#77). The runtime behavior at extraction time is the
 * spec — these tests pin it; they do not bless it as ideal.
 *
 * The dead `advanceCursor` state machine was deleted rather than wired in:
 * the shipped completion flow ALWAYS auto-stages a new set in the same
 * exercise (it never advances onto a pre-existing next set, never crosses
 * exercises on its own, and repositions via findInitialCursor — first
 * incomplete anywhere — when the cursor goes stale).
 */
import {
  canCompleteSet,
  exerciseSetStrip,
  ghostSetStrip,
  planFirstSet,
  planStagedSet,
  resolveCursor,
  setValuesLabel,
  workoutHeaderTitle,
  type ExerciseShape,
  type SetShape,
} from '@/components/activeSet';

function ex(id: string, sets: { id: string; completed: boolean }[]): ExerciseShape {
  return {
    id,
    exerciseId: `e-${id}`,
    exerciseName: id,
    orderIndex: 0,
    muscleGroup: null,
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

const set = (over: Partial<SetShape> = {}): SetShape => ({
  id: 's1',
  weId: 'we1',
  orderIndex: 0,
  weight: 60,
  reps: 8,
  units: 'kg',
  completed: true,
  ...over,
});

describe('resolveCursor — initialization (didInit semantics)', () => {
  test('empty workout: clears the cursor and resets didInit so the next load re-initializes', () => {
    expect(resolveCursor([], { weId: 'a', setId: 'a1' }, true, null)).toEqual({
      cursor: null,
      didInit: false,
      pendingTargetWeId: null,
    });
  });

  test('empty workout preserves a pending add-target (it may still be loading)', () => {
    expect(resolveCursor([], null, false, 'we-new').pendingTargetWeId).toBe('we-new');
  });

  test('first load (null cursor, didInit=false): lands on the first incomplete set anywhere', () => {
    const exercises = [
      ex('a', [{ id: 'a1', completed: true }]),
      ex('b', [{ id: 'b1', completed: false }]),
    ];
    expect(resolveCursor(exercises, null, false, null)).toEqual({
      cursor: { weId: 'b', setId: 'b1' },
      didInit: true,
      pendingTargetWeId: null,
    });
  });

  test('first load of an all-complete workout: cursor stays null (recap) but didInit flips true (#15 — never loop onto a completed set)', () => {
    const exercises = [ex('a', [{ id: 'a1', completed: true }])];
    expect(resolveCursor(exercises, null, false, null)).toEqual({
      cursor: null,
      didInit: true,
      pendingTargetWeId: null,
    });
  });

  test('null-because-finished (didInit=true): leaves the cursor alone so the recap shows', () => {
    const exercises = [ex('a', [{ id: 'a1', completed: false }])];
    const res = resolveCursor(exercises, null, true, null);
    // No `cursor` key at all — the screen must NOT call setCursor and bounce
    // the user out of the finish summary back into an incomplete set.
    expect('cursor' in res).toBe(false);
    expect(res.didInit).toBe(true);
  });
});

describe('resolveCursor — validity + repositioning', () => {
  const exercises = [
    ex('a', [
      { id: 'a1', completed: true },
      { id: 'a2', completed: false },
    ]),
    ex('b', [{ id: 'b1', completed: false }]),
  ];

  test('cursor on a live incomplete set: untouched (and didInit is forced true)', () => {
    const res = resolveCursor(exercises, { weId: 'b', setId: 'b1' }, false, null);
    expect('cursor' in res).toBe(false);
    expect(res.didInit).toBe(true);
  });

  test('cursor on a set missing from the cache (just staged, refetch pending): kept — the data will catch up', () => {
    const res = resolveCursor(exercises, { weId: 'b', setId: 'not-yet-loaded' }, true, null);
    expect('cursor' in res).toBe(false);
    expect(res.didInit).toBe(true);
  });

  test('cursor on a completed set: repositions to the first incomplete set anywhere — even an EARLIER exercise', () => {
    expect(resolveCursor(exercises, { weId: 'a', setId: 'a1' }, true, null).cursor).toEqual({
      weId: 'a',
      setId: 'a2',
    });
    // Backward jump: cursor completed in b, but a2 (earlier) is still open.
    const done = [
      ex('a', [
        { id: 'a1', completed: true },
        { id: 'a2', completed: false },
      ]),
      ex('b', [{ id: 'b1', completed: true }]),
    ];
    expect(resolveCursor(done, { weId: 'b', setId: 'b1' }, true, null).cursor).toEqual({
      weId: 'a',
      setId: 'a2',
    });
  });

  test('cursor on a vanished exercise: repositions to the first incomplete set', () => {
    expect(resolveCursor(exercises, { weId: 'gone', setId: 'x' }, true, null).cursor).toEqual({
      weId: 'a',
      setId: 'a2',
    });
  });

  test('cursor on a completed set with nothing left: clears to null → recap', () => {
    const done = [ex('a', [{ id: 'a1', completed: true }])];
    expect(resolveCursor(done, { weId: 'a', setId: 'a1' }, true, null)).toEqual({
      cursor: null,
      didInit: true,
      pendingTargetWeId: null,
    });
  });
});

describe('resolveCursor — add-exercise-from-recap targeting (#13)', () => {
  const exercises = [
    ex('a', [{ id: 'a1', completed: false }]),
    ex('new', [{ id: 'n1', completed: false }]),
  ];

  test('lands on the added exercise’s staged set — NOT the first incomplete set anywhere — and clears the target', () => {
    expect(resolveCursor(exercises, null, false, 'new')).toEqual({
      cursor: { weId: 'new', setId: 'n1' },
      didInit: true,
      pendingTargetWeId: null,
    });
  });

  test('target not in the cached data yet: waits (keeps the target, does not touch the cursor)', () => {
    const res = resolveCursor(exercises, null, false, 'still-loading');
    expect('cursor' in res).toBe(false);
    expect(res).toMatchObject({ didInit: false, pendingTargetWeId: 'still-loading' });
  });

  test('target loaded but its sets are all complete: still waits for an incomplete set', () => {
    const allDone = [ex('new', [{ id: 'n1', completed: true }])];
    const res = resolveCursor(allDone, null, true, 'new');
    expect('cursor' in res).toBe(false);
    expect(res.pendingTargetWeId).toBe('new');
  });

  test('a pending target outranks an existing valid cursor', () => {
    expect(resolveCursor(exercises, { weId: 'a', setId: 'a1' }, true, 'new').cursor).toEqual({
      weId: 'new',
      setId: 'n1',
    });
  });
});

describe('planStagedSet — auto-stage on completion (Phase 3, #131)', () => {
  test('carries the completed set’s weight × reps and stamps the session unit', () => {
    expect(planStagedSet(set({ weight: 60, reps: 8 }), 'kg')).toEqual({
      weight: 60,
      reps: 8,
      units: 'kg',
    });
    expect(planStagedSet(set({ weight: 135, reps: 5, units: 'lb' }), 'lb')).toEqual({
      weight: 135,
      reps: 5,
      units: 'lb',
    });
  });

  test('no weight carried → units stay null (null units mark an empty staged set, #131)', () => {
    expect(planStagedSet(set({ weight: null, reps: null }), 'kg')).toEqual({
      weight: null,
      reps: null,
      units: null,
    });
    // reps without weight still stages unit-less — units follow the weight.
    expect(planStagedSet(set({ weight: null, reps: 12 }), 'kg')).toEqual({
      weight: null,
      reps: 12,
      units: null,
    });
  });

  test('completed set missing from the cache: stages a fully empty set', () => {
    expect(planStagedSet(null, 'lb')).toEqual({ weight: null, reps: null, units: null });
  });
});

describe('workoutHeaderTitle — fallback uses the STARTED day, not today (1.7/#156)', () => {
  // 2026-07-11 was a Saturday; freeze "now" to the following Sunday so a wrong
  // implementation (falling back to the current day) is caught red-handed.
  const startedSaturday = '2026-07-11T22:45:00.000Z';

  test('a real title wins over any date', () => {
    expect(workoutHeaderTitle('Push day', startedSaturday)).toBe('Push day');
  });

  test('whitespace-only title falls back like an empty one', () => {
    expect(workoutHeaderTitle('   ', new Date(2026, 6, 11))).toBe('Saturday');
  });

  test('empty/null title falls back to the workout’s started day', () => {
    // Local-time constructor avoids timezone flakiness around midnight UTC.
    expect(workoutHeaderTitle('', new Date(2026, 6, 11))).toBe('Saturday');
    expect(workoutHeaderTitle(null, new Date(2026, 6, 10))).toBe('Friday');
    expect(workoutHeaderTitle(undefined, new Date(2026, 6, 12))).toBe('Sunday');
  });

  test('started day is used even when it differs from the current day', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 12, 1, 0)); // Sunday 01:00
    try {
      expect(workoutHeaderTitle('', new Date(2026, 6, 11, 22, 45))).toBe('Saturday');
    } finally {
      jest.useRealTimers();
    }
  });

  test('missing or unparseable started_at falls back to today', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 12, 1, 0)); // Sunday
    try {
      expect(workoutHeaderTitle('', null)).toBe('Sunday');
      expect(workoutHeaderTitle('', 'not-a-date')).toBe('Sunday');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('mono strips (Blacktop metadata treatment)', () => {
  test('exerciseSetStrip: position line with a single middot run', () => {
    expect(exerciseSetStrip(2, 3, 4)).toBe('EXERCISE 2/3 · SET 4');
  });

  test('ghostSetStrip: banked set line', () => {
    expect(ghostSetStrip(1, { weight: 60, reps: 8 })).toBe('SET 1 · 60 × 8');
  });

  test('ghostSetStrip: null weight renders BW, null reps keeps the read-only dash (spec §4)', () => {
    expect(ghostSetStrip(2, { weight: null, reps: 8 })).toBe('SET 2 · BW × 8');
    expect(ghostSetStrip(3, { weight: 100, reps: null })).toBe('SET 3 · 100 × -');
  });
});

describe('canCompleteSet — reps required, weight optional (spec §4)', () => {
  test('reps present, weight null → loggable (bodyweight)', () => {
    expect(canCompleteSet({ reps: 8 })).toBe(true);
  });
  test('reps null → not loggable', () => {
    expect(canCompleteSet({ reps: null })).toBe(false);
  });
  test('null set → not loggable', () => {
    expect(canCompleteSet(null)).toBe(false);
  });
  // The reps stepper's minus clamps an empty value to 0 (applyStep floor) —
  // that must not arm LOG SET with "× 0" (2026-08-25 regression run).
  test('zero reps → not loggable', () => {
    expect(canCompleteSet({ reps: 0 })).toBe(false);
  });
});

describe('setValuesLabel — BW display (spec §4)', () => {
  test('weighted set', () => {
    expect(setValuesLabel(60, 8)).toBe('60 × 8');
  });
  test('bodyweight set', () => {
    expect(setValuesLabel(null, 12)).toBe('BW × 12');
  });
  test('legacy missing reps keeps the read-only dash', () => {
    expect(setValuesLabel(60, null)).toBe('60 × -');
  });
});

describe('planFirstSet — never-empty prefill (spec §2)', () => {
  const lastKg = [
    { orderIndex: 0, weight: 60, reps: 8, units: 'kg' as const },
    { orderIndex: 1, weight: 80, reps: 5, units: 'kg' as const },
  ];

  test('seeds from last session set 1, same unit', () => {
    expect(planFirstSet(lastKg, 'kg', 2.5)).toEqual({ weight: 60, reps: 8, units: 'kg' });
  });

  test('converts units and rounds to the current step (60 kg → lb, step 5)', () => {
    const plan = planFirstSet(lastKg, 'lb', 5);
    // 60 kg = 132.28 lb → nearest 5 = 130
    expect(plan).toEqual({ weight: 130, reps: 8, units: 'lb' });
  });

  test('falls back to the top set when set 1 carries no values', () => {
    const last = [
      { orderIndex: 0, weight: null, reps: null, units: null },
      { orderIndex: 1, weight: 80, reps: 5, units: 'kg' as const },
    ];
    expect(planFirstSet(last, 'kg', 2.5)).toEqual({ weight: 80, reps: 5, units: 'kg' });
  });

  test('bodyweight history seeds reps without a unit stamp (#131)', () => {
    const last = [{ orderIndex: 0, weight: null, reps: 12, units: null }];
    expect(planFirstSet(last, 'kg', 2.5)).toEqual({ weight: null, reps: 12, units: null });
  });

  test('no history → truly empty stage', () => {
    expect(planFirstSet([], 'kg', 2.5)).toEqual({ weight: null, reps: null, units: null });
  });
});

describe('ghostSetStrip — BW (spec §4)', () => {
  test('bodyweight ghost row', () => {
    expect(ghostSetStrip(1, { weight: null, reps: 12 })).toBe('SET 1 · BW × 12');
  });
});
