import { createSessionPRTracker, registerBankedSet } from '@/queries/sessionPRs';

test('a set that beats the all-time heaviest fires a PR', () => {
  const t = createSessionPRTracker({ bench: 100 });
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 102.5, units: 'kg' })).toBe(true);
});

test('a set at or below the all-time best does not fire', () => {
  const t = createSessionPRTracker({ bench: 100 });
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 100, units: 'kg' })).toBe(false);
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 95, units: 'kg' })).toBe(false);
});

test('a brand-new exercise seeds a baseline silently, then PRs when beaten', () => {
  const t = createSessionPRTracker({});
  // First-ever logged set establishes the baseline — not a celebration.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 60, units: 'kg' })).toBe(false);
  // A later, heavier set this session genuinely PRs.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 65, units: 'kg' })).toBe(true);
  // And again raises the running bar.
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 62, units: 'kg' })).toBe(false);
  expect(registerBankedSet(t, { exerciseId: 'rows', weight: 70, units: 'kg' })).toBe(true);
});

test('units are normalized to kg before comparison', () => {
  const t = createSessionPRTracker({ bench: 100 }); // 100 kg all-time
  // 225 lb ≈ 102.06 kg → a PR.
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 225, units: 'lb' })).toBe(true);
  // 215 lb ≈ 97.5 kg, below the new 102 kg bar → no PR.
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 215, units: 'lb' })).toBe(false);
});

test('null/zero/negative weights never PR', () => {
  const t = createSessionPRTracker({ bench: 100 });
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: null, units: 'kg' })).toBe(false);
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 0, units: 'kg' })).toBe(false);
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: -5, units: 'kg' })).toBe(false);
});

test('exercises are tracked independently', () => {
  const t = createSessionPRTracker({ bench: 100, squat: 140 });
  expect(registerBankedSet(t, { exerciseId: 'bench', weight: 105, units: 'kg' })).toBe(true);
  expect(registerBankedSet(t, { exerciseId: 'squat', weight: 130, units: 'kg' })).toBe(false);
  expect(registerBankedSet(t, { exerciseId: 'squat', weight: 145, units: 'kg' })).toBe(true);
});
