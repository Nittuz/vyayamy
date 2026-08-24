import type { AutoStagedSet } from '@/components/activeSet';
import { stashSeedMarkers, takeSeedMarkers } from '@/screens/workoutActive/pendingSeedMarkers';

const marker = (over: Partial<AutoStagedSet> = {}): AutoStagedSet => ({
  id: 'set-1',
  weight: 135,
  reps: 8,
  source: 'history',
  ...over,
});

test('takeSeedMarkers returns null for an id that was never stashed', () => {
  expect(takeSeedMarkers('never-stashed')).toBeNull();
});

test('takeSeedMarkers returns exactly what was stashed for that workout id', () => {
  const markers = [marker({ id: 's1' }), marker({ id: 's2', weight: 60, reps: 12 })];
  stashSeedMarkers('w1', markers);
  expect(takeSeedMarkers('w1')).toEqual(markers);
});

test('take is one-shot — a second take for the same id returns null', () => {
  stashSeedMarkers('w1', [marker()]);
  expect(takeSeedMarkers('w1')).not.toBeNull();
  expect(takeSeedMarkers('w1')).toBeNull();
});

test('stashing for one workout id does not affect another', () => {
  stashSeedMarkers('w1', [marker({ id: 's1' })]);
  stashSeedMarkers('w2', [marker({ id: 's2' })]);
  expect(takeSeedMarkers('w1')).toEqual([marker({ id: 's1' })]);
  expect(takeSeedMarkers('w2')).toEqual([marker({ id: 's2' })]);
});

test('a later stash for the same id replaces the earlier one', () => {
  stashSeedMarkers('w1', [marker({ id: 's1' })]);
  stashSeedMarkers('w1', [marker({ id: 's2' })]);
  expect(takeSeedMarkers('w1')).toEqual([marker({ id: 's2' })]);
});

test('stashing an empty array is a valid one-shot handoff, distinct from "never stashed"', () => {
  stashSeedMarkers('w-empty', []);
  expect(takeSeedMarkers('w-empty')).toEqual([]);
  // Second take is the one-shot null, not the empty array again.
  expect(takeSeedMarkers('w-empty')).toBeNull();
});
