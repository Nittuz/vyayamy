import { describe, it, expect } from 'vitest';

type SetRow = { weight: number | null; reps: number | null; completed: boolean };

function computeBestMetrics(sets: SetRow[]) {
  const completedSets = sets.filter((s) => s.completed && (s.weight != null || s.reps != null));
  if (completedSets.length === 0) return null;

  let bestWeight: number | null = null;
  let bestVolume = 0;
  let bestRepsAtWeight: { weight: number; reps: number } | null = null;

  for (const s of completedSets) {
    const w = s.weight ?? 0;
    const r = s.reps ?? 0;
    const vol = w * r;
    if (w > 0 && (bestWeight == null || w > bestWeight)) bestWeight = w;
    if (vol > bestVolume) bestVolume = vol;
    if (w > 0 && r > 0 && (bestRepsAtWeight == null || r > bestRepsAtWeight.reps || (r === bestRepsAtWeight.reps && w > bestRepsAtWeight.weight)))
      bestRepsAtWeight = { weight: w, reps: r };
  }

  return { bestWeight, bestVolume, bestRepsAtWeight };
}

describe('PR computation logic', () => {
  it('returns null for no completed sets', () => {
    expect(computeBestMetrics([
      { weight: 100, reps: 5, completed: false },
    ])).toBeNull();
  });

  it('returns null for empty sets', () => {
    expect(computeBestMetrics([])).toBeNull();
  });

  it('finds the heaviest weight', () => {
    const result = computeBestMetrics([
      { weight: 80, reps: 5, completed: true },
      { weight: 100, reps: 3, completed: true },
      { weight: 90, reps: 4, completed: true },
    ]);
    expect(result?.bestWeight).toBe(100);
  });

  it('calculates best volume (weight * reps)', () => {
    const result = computeBestMetrics([
      { weight: 80, reps: 10, completed: true },
      { weight: 100, reps: 5, completed: true },
    ]);
    expect(result?.bestVolume).toBe(800);
  });

  it('finds most reps at weight (prefers more reps)', () => {
    const result = computeBestMetrics([
      { weight: 80, reps: 5, completed: true },
      { weight: 80, reps: 8, completed: true },
      { weight: 60, reps: 12, completed: true },
    ]);
    expect(result?.bestRepsAtWeight).toEqual({ weight: 60, reps: 12 });
  });

  it('for same reps, prefers heavier weight', () => {
    const result = computeBestMetrics([
      { weight: 80, reps: 5, completed: true },
      { weight: 100, reps: 5, completed: true },
    ]);
    expect(result?.bestRepsAtWeight).toEqual({ weight: 100, reps: 5 });
  });

  it('ignores incomplete sets', () => {
    const result = computeBestMetrics([
      { weight: 200, reps: 1, completed: false },
      { weight: 80, reps: 5, completed: true },
    ]);
    expect(result?.bestWeight).toBe(80);
  });

  it('handles bodyweight sets (null weight)', () => {
    const result = computeBestMetrics([
      { weight: null, reps: 10, completed: true },
    ]);
    expect(result?.bestWeight).toBeNull();
    expect(result?.bestVolume).toBe(0);
    expect(result?.bestRepsAtWeight).toBeNull();
  });
});
