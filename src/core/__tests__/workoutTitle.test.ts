import { workoutDisplayTitle } from '@/core/workoutTitle';

// 2026-10-04T16:20 local is a Sunday.
const sunday = new Date(2026, 9, 4, 16, 20).toISOString();

test('a named workout keeps its name', () => {
  expect(workoutDisplayTitle('Push day', sunday)).toBe('Push day');
});

test('an unnamed workout is listed by the day it started', () => {
  expect(workoutDisplayTitle(null, sunday)).toBe('Sunday');
  expect(workoutDisplayTitle('', sunday)).toBe('Sunday');
  expect(workoutDisplayTitle('  ', sunday)).toBe('Sunday');
});

test('the stored default "Workout" counts as unnamed', () => {
  expect(workoutDisplayTitle('Workout', sunday)).toBe('Sunday');
});

test('with no usable start it falls back to the default word', () => {
  expect(workoutDisplayTitle(null, null)).toBe('Workout');
  expect(workoutDisplayTitle(null, 'not a date')).toBe('Workout');
});
