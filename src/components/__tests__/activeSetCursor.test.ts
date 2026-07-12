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
  planStagedSet,
  resolveCursor,
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
