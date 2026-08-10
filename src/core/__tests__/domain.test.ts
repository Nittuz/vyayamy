import { parsePRValue, deriveWorkoutStatus } from '@/core/domain';
import type { Workout } from '@/db/types';

describe('parsePRValue', () => {
  test('parses heaviest_weight from a number', () => {
    expect(parsePRValue('heaviest_weight', 225)).toEqual({ type: 'heaviest_weight', value: 225 });
  });

  test('rejects heaviest_weight when value is not a number', () => {
    expect(parsePRValue('heaviest_weight', '225')).toBeNull();
  });

  test('parses most_reps from a {reps, weight} object', () => {
    expect(parsePRValue('most_reps', { reps: 8, weight: 100 })).toEqual({
      type: 'most_reps',
      value: { reps: 8, weight: 100 },
    });
  });

  test('parses a bodyweight most_reps (null weight)', () => {
    expect(parsePRValue('most_reps', { reps: 15, weight: null })).toEqual({
      type: 'most_reps',
      value: { reps: 15, weight: null },
    });
  });

  test('rejects most_reps when shape is wrong', () => {
    expect(parsePRValue('most_reps', { weight: 100 })).toBeNull();
    expect(parsePRValue('most_reps', 100)).toBeNull();
    expect(parsePRValue('most_reps', null)).toBeNull();
  });

  test('returns null for retired record types (best_volume, most_reps_at_weight)', () => {
    expect(parsePRValue('best_volume', 4500)).toBeNull();
    expect(parsePRValue('most_reps_at_weight', { weight: 100, reps: 8 })).toBeNull();
  });

  test('returns null for an unknown type', () => {
    expect(parsePRValue('something_else', 1)).toBeNull();
  });
});

describe('deriveWorkoutStatus', () => {
  const base: Workout = {
    id: 'w1',
    user_id: 'u1',
    started_at: '2026-01-01T10:00:00.000Z',
    ended_at: null,
    title: 'Push',
    template_id: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    deleted_at: null,
  };

  test('is "active" while ended_at is null', () => {
    expect(deriveWorkoutStatus(base)).toBe('active');
  });

  test('is "completed" once ended_at is set', () => {
    expect(deriveWorkoutStatus({ ...base, ended_at: '2026-01-01T11:00:00.000Z' })).toBe(
      'completed',
    );
  });
});
