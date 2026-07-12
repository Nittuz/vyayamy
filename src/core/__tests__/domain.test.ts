import { parsePRValue, deriveWorkoutStatus } from '@/core/domain';
import type { Workout } from '@/db/types';

describe('parsePRValue', () => {
  test('parses heaviest_weight from a number', () => {
    expect(parsePRValue('heaviest_weight', 225)).toEqual({ type: 'heaviest_weight', value: 225 });
  });

  test('rejects heaviest_weight when value is not a number', () => {
    expect(parsePRValue('heaviest_weight', '225')).toBeNull();
  });

  test('parses best_volume from a number', () => {
    expect(parsePRValue('best_volume', 4500)).toEqual({ type: 'best_volume', value: 4500 });
  });

  test('rejects best_volume when value is not a number', () => {
    expect(parsePRValue('best_volume', null)).toBeNull();
  });

  test('parses most_reps_at_weight from a {weight, reps} object', () => {
    expect(parsePRValue('most_reps_at_weight', { weight: 100, reps: 8 })).toEqual({
      type: 'most_reps_at_weight',
      value: { weight: 100, reps: 8 },
    });
  });

  test('rejects most_reps_at_weight when shape is wrong', () => {
    expect(parsePRValue('most_reps_at_weight', { weight: 100 })).toBeNull();
    expect(parsePRValue('most_reps_at_weight', 100)).toBeNull();
    expect(parsePRValue('most_reps_at_weight', null)).toBeNull();
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
