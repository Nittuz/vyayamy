import { computePRs } from '@/core/pr-detection';

const at = (d: string) => `2026-0${d}`;

describe('computePRs', () => {
  it('returns no PRs when nothing is completed', () => {
    expect(computePRs([{ weight: 100, reps: 5, units: 'kg', completed: false, completedAt: at('1-01') }])).toEqual([]);
  });

  it('emits heaviest, volume and most-reps with the achieving timestamp', () => {
    const prs = computePRs([
      { weight: 140, reps: 5, units: 'kg', completed: true, completedAt: at('1-01') }, // heaviest 140
      { weight: 100, reps: 10, units: 'kg', completed: true, completedAt: at('1-02') }, // volume 1000, reps 10@100
    ]);
    const byType = Object.fromEntries(prs.map((p) => [p.type, p]));
    expect(byType.heaviest_weight).toEqual({ type: 'heaviest_weight', value: 140, achievedAt: at('1-01') });
    expect(byType.best_volume).toEqual({ type: 'best_volume', value: 1000, achievedAt: at('1-02') });
    expect(byType.most_reps_at_weight).toEqual({
      type: 'most_reps_at_weight',
      value: { weight: 100, reps: 10 },
      achievedAt: at('1-02'),
    });
  });

  it('normalizes weights to kg so units are comparable (#132)', () => {
    // 225 lb (~102.06 kg) beats 100 kg, even though raw 100 > 225-as-number is false.
    const prs = computePRs([
      { weight: 100, reps: 1, units: 'kg', completed: true, completedAt: at('1-01') },
      { weight: 225, reps: 1, units: 'lb', completed: true, completedAt: at('1-02') },
    ]);
    const heaviest = prs.find((p) => p.type === 'heaviest_weight')!;
    expect(heaviest.value).toBeCloseTo(102.06, 1);
    expect(heaviest.achievedAt).toBe(at('1-02'));
  });

  it('treats a null unit as kg (legacy rows)', () => {
    const prs = computePRs([{ weight: 80, reps: 5, units: null, completed: true, completedAt: at('1-01') }]);
    expect(prs.find((p) => p.type === 'heaviest_weight')!.value).toBe(80);
  });
});
