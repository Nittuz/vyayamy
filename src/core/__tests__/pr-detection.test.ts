import { computePRs } from '@/core/pr-detection';

const at = (d: string) => `2026-0${d}`;

describe('computePRs', () => {
  it('returns no PRs when nothing is completed', () => {
    expect(
      computePRs([
        { weight: 100, reps: 5, units: 'kg', completed: false, completedAt: at('1-01') },
      ]),
    ).toEqual([]);
  });

  it('emits heaviest weight and most reps with the achieving timestamp', () => {
    const prs = computePRs([
      { weight: 140, reps: 5, units: 'kg', completed: true, completedAt: at('1-01') }, // heaviest 140
      { weight: 100, reps: 10, units: 'kg', completed: true, completedAt: at('1-02') }, // reps 10 @ 100
    ]);
    expect(prs).toHaveLength(2);
    const byType = Object.fromEntries(prs.map((p) => [p.type, p]));
    expect(byType.heaviest_weight).toEqual({
      type: 'heaviest_weight',
      value: 140,
      achievedAt: at('1-01'),
    });
    expect(byType.most_reps).toEqual({
      type: 'most_reps',
      value: { reps: 10, weight: 100 },
      achievedAt: at('1-02'),
    });
  });

  it('never emits a volume record (retired 2026-08-09)', () => {
    const prs = computePRs([
      { weight: 100, reps: 30, units: 'kg', completed: true, completedAt: at('1-01') },
    ]);
    expect(prs.map((p) => p.type).sort()).toEqual(['heaviest_weight', 'most_reps']);
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
    const prs = computePRs([
      { weight: 80, reps: 5, units: null, completed: true, completedAt: at('1-01') },
    ]);
    expect(prs.find((p) => p.type === 'heaviest_weight')!.value).toBe(80);
  });

  it('bodyweight sets (null weight) earn the most-reps record', () => {
    const prs = computePRs([
      { weight: null, reps: 12, units: null, completed: true, completedAt: at('1-01') },
      { weight: null, reps: 15, units: null, completed: true, completedAt: at('1-02') },
    ]);
    expect(prs).toEqual([
      { type: 'most_reps', value: { reps: 15, weight: null }, achievedAt: at('1-02') },
    ]);
  });

  it('breaks a rep tie toward the heavier set; bodyweight loses to any weight', () => {
    const prs = computePRs([
      { weight: null, reps: 10, units: null, completed: true, completedAt: at('1-01') },
      { weight: 20, reps: 10, units: 'kg', completed: true, completedAt: at('1-02') },
    ]);
    expect(prs.find((p) => p.type === 'most_reps')).toEqual({
      type: 'most_reps',
      value: { reps: 10, weight: 20 },
      achievedAt: at('1-02'),
    });
  });

  it('bodyweight reps can beat a weighted rep record outright', () => {
    const prs = computePRs([
      { weight: 80, reps: 5, units: 'kg', completed: true, completedAt: at('1-01') },
      { weight: null, reps: 6, units: null, completed: true, completedAt: at('1-02') },
    ]);
    const byType = Object.fromEntries(prs.map((p) => [p.type, p]));
    expect(byType.heaviest_weight!.value).toBe(80);
    expect(byType.most_reps).toEqual({
      type: 'most_reps',
      value: { reps: 6, weight: null },
      achievedAt: at('1-02'),
    });
  });
});
