import { createSessionPRTracker, registerBankedSet } from '@/queries/sessionPRs';

test('a set that beats the all-time heaviest fires a PR', () => {
  const t = createSessionPRTracker({ bench: 100 }, {});
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 102.5, reps: 5, units: 'kg' })).toBe(
    true,
  );
});

test('a set at or below the all-time best does not fire', () => {
  const t = createSessionPRTracker({ bench: 100 }, {});
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 100, reps: 5, units: 'kg' })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 95, reps: 5, units: 'kg' })).toBe(
    false,
  );
});

test('a brand-new exercise seeds a baseline silently, then PRs when beaten', () => {
  const t = createSessionPRTracker({}, {});
  // First-ever logged set establishes the baseline — not a celebration.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 60, reps: 8, units: 'kg' })).toBe(
    false,
  );
  // A later, heavier set this session genuinely PRs.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 65, reps: 8, units: 'kg' })).toBe(true);
  // And again raises the running bar.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 62, reps: 8, units: 'kg' })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 70, reps: 8, units: 'kg' })).toBe(true);
});

test('units are normalized to kg before comparison', () => {
  const t = createSessionPRTracker({ bench: 100 }, {}); // 100 kg all-time
  // 225 lb ≈ 102.06 kg → a PR.
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 225, reps: 1, units: 'lb' })).toBe(
    true,
  );
  // 215 lb ≈ 97.5 kg, below the new 102 kg bar → no PR.
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 215, reps: 1, units: 'lb' })).toBe(
    false,
  );
});

test('null/zero/negative weights never fire a weight PR', () => {
  const t = createSessionPRTracker({ bench: 100 }, {});
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: null, reps: null, units: 'kg' })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 0, reps: null, units: 'kg' })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: -5, reps: null, units: 'kg' })).toBe(
    false,
  );
});

test('exercises are tracked independently', () => {
  const t = createSessionPRTracker({ bench: 100, squat: 140 }, {});
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 105, reps: 5, units: 'kg' })).toBe(
    true,
  );
  expect(registerBankedSet(t, { exerciseId: 'squat', weight: 130, reps: 5, units: 'kg' })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'squat', weight: 145, reps: 5, units: 'kg' })).toBe(
    true,
  );
});

// --- bodyweight rep PRs (2026-08-09 spec) ----------------------------------

test('a bodyweight set that beats the all-time most-reps fires a rep PR', () => {
  const t = createSessionPRTracker({}, { pullup: 10 });
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: null, reps: 11, units: null })).toBe(
    true,
  );
});

test('a bodyweight set at or below the rep record does not fire', () => {
  const t = createSessionPRTracker({}, { pullup: 10 });
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: null, reps: 10, units: null })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: null, reps: 8, units: null })).toBe(
    false,
  );
});

test('a first-ever bodyweight set seeds the rep baseline silently, then PRs when beaten', () => {
  const t = createSessionPRTracker({}, {});
  expect(registerBankedSet(t, { exerciseId: 'dips', weight: null, reps: 8, units: null })).toBe(
    false,
  );
  expect(registerBankedSet(t, { exerciseId: 'dips', weight: null, reps: 9, units: null })).toBe(
    true,
  );
});

test('weighted sets raise the rep baseline without celebrating reps', () => {
  const t = createSessionPRTracker({ pullup: 20 }, { pullup: 10 });
  // A weighted 12-rep set beats the rep record but weight is its signal — and
  // 10 kg does not beat the 20 kg record, so nothing fires…
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: 10, reps: 12, units: 'kg' })).toBe(
    false,
  );
  // …but the rep bar moved to 12: a later bodyweight 11 is not a record…
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: null, reps: 11, units: null })).toBe(
    false,
  );
  // …while beating the raised bar celebrates.
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: null, reps: 13, units: null })).toBe(
    true,
  );
});

test('a weighted set fires the weight signal even when it also beats the rep record', () => {
  const t = createSessionPRTracker({ pullup: 20 }, { pullup: 10 });
  expect(registerBankedSet(t, { exerciseId: 'pullup', weight: 25, reps: 12, units: 'kg' })).toBe(
    true,
  );
});
