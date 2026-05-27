import {
  advanceCursor,
  type ActiveCursor,
  type ExerciseShape,
} from '@/components/activeSet';

const ex = (id: string, setIds: string[]): ExerciseShape => ({
  id,
  exerciseId: `ex-${id}`,
  exerciseName: `Exercise ${id}`,
  orderIndex: 0,
  sets: setIds.map((sid, i) => ({
    id: sid,
    weId: id,
    orderIndex: i,
    weight: 100,
    reps: 5,
    completed: false,
  })),
});

describe('advanceCursor', () => {
  test('advances to next set within same exercise', () => {
    const exercises = [ex('we1', ['s1', 's2', 's3'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's1' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we1', setId: 's2' });
  });

  test('advances to first set of next exercise when current is the last set', () => {
    const exercises = [ex('we1', ['s1', 's2']), ex('we2', ['s3', 's4'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's2' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we2', setId: 's3' });
  });

  test('returns null (finish workout) when on last set of last exercise', () => {
    const exercises = [ex('we1', ['s1', 's2'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's2' };
    expect(advanceCursor(exercises, cursor)).toBeNull();
  });

  test('skips empty exercises (zero sets)', () => {
    const exercises = [ex('we1', ['s1']), ex('we2', []), ex('we3', ['s2'])];
    const cursor: ActiveCursor = { weId: 'we1', setId: 's1' };
    expect(advanceCursor(exercises, cursor)).toEqual({ weId: 'we3', setId: 's2' });
  });

  test('returns null when cursor refers to a set that does not exist', () => {
    const exercises = [ex('we1', ['s1'])];
    expect(advanceCursor(exercises, { weId: 'we1', setId: 'ghost' })).toBeNull();
  });
});
