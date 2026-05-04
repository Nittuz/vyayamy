/**
 * Ported from legacy-web/src/lib/__tests__/pr-detection.test.ts.
 * The pure computation surface is unchanged; only the test runner
 * switched from Vitest to Jest.
 */
import { computeBestMetrics, detectNewPRs } from '@/core/pr-detection';

describe('computeBestMetrics', () => {
  it('returns nulls for no completed sets', () => {
    const m = computeBestMetrics([{ weight: 100, reps: 5, completed: false }]);
    expect(m.bestWeight).toBeNull();
    expect(m.bestVolume).toBe(0);
    expect(m.bestRepsAtWeight).toBeNull();
  });

  it('finds the heaviest weight', () => {
    const m = computeBestMetrics([
      { weight: 80, reps: 5, completed: true },
      { weight: 100, reps: 3, completed: true },
      { weight: 90, reps: 4, completed: true },
    ]);
    expect(m.bestWeight).toBe(100);
  });

  it('calculates best volume', () => {
    const m = computeBestMetrics([
      { weight: 80, reps: 10, completed: true },
      { weight: 100, reps: 5, completed: true },
    ]);
    expect(m.bestVolume).toBe(800);
  });

  it('most reps wins; ties go to heavier weight', () => {
    const m = computeBestMetrics([
      { weight: 80, reps: 5, completed: true },
      { weight: 100, reps: 5, completed: true },
    ]);
    expect(m.bestRepsAtWeight).toEqual({ weight: 100, reps: 5 });
  });

  it('ignores incomplete sets', () => {
    const m = computeBestMetrics([
      { weight: 200, reps: 1, completed: false },
      { weight: 80, reps: 5, completed: true },
    ]);
    expect(m.bestWeight).toBe(80);
  });
});

describe('detectNewPRs', () => {
  it('emits all three candidates on a cold exercise', () => {
    const m = computeBestMetrics([{ weight: 100, reps: 5, completed: true }]);
    const cands = detectNewPRs(m, new Map());
    expect(cands.map((c) => c.type).sort()).toEqual([
      'best_volume',
      'heaviest_weight',
      'most_reps_at_weight',
    ]);
  });

  it('skips candidates that do not beat the existing PR', () => {
    const m = computeBestMetrics([{ weight: 100, reps: 5, completed: true }]);
    const existing = new Map<string, unknown>([
      ['heaviest_weight', 200],
      ['best_volume', 999],
      ['most_reps_at_weight', { weight: 120, reps: 8 }],
    ]);
    expect(detectNewPRs(m, existing)).toEqual([]);
  });
});
