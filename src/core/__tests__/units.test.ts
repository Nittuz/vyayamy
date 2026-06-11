import { convertWeight, DEFAULT_UNITS, sumVolume, toKg } from '../units';

describe('weight conversion', () => {
  test('identity conversion returns the same value', () => {
    expect(convertWeight(100, 'kg', 'kg')).toBe(100);
    expect(convertWeight(225, 'lb', 'lb')).toBe(225);
  });

  test('lb <-> kg uses the exact factor 0.45359237', () => {
    expect(toKg(225, 'lb')).toBeCloseTo(102.0582, 3);
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.462, 2);
  });

  test('round-trips without drifting', () => {
    const there = convertWeight(140, 'lb', 'kg');
    expect(convertWeight(there, 'kg', 'lb')).toBeCloseTo(140, 6);
  });

  test('DEFAULT_UNITS matches the schema/server default (kg)', () => {
    expect(DEFAULT_UNITS).toBe('kg');
  });
});

describe('sumVolume', () => {
  test('sums weight*reps converted into the target unit', () => {
    // 100kg x 5 = 500kg-units; 220.462lb is the same lift, x5 ~= 1102.31 lb-units
    const kg = sumVolume([{ weight: 100, reps: 5, units: 'kg' }], 'kg');
    expect(kg).toBeCloseTo(500, 6);
    const lb = sumVolume([{ weight: 100, reps: 5, units: 'kg' }], 'lb');
    expect(lb).toBeCloseTo(1102.31, 1);
  });

  test('mixes units correctly into one total', () => {
    // 100kg x 1 (=100kg) + 100lb x 1 (=~45.36kg) => ~145.36 kg
    const total = sumVolume(
      [
        { weight: 100, reps: 1, units: 'kg' },
        { weight: 100, reps: 1, units: 'lb' },
      ],
      'kg',
    );
    expect(total).toBeCloseTo(145.359, 2);
  });

  test('treats a missing unit as the fallback and skips null weights/reps', () => {
    const total = sumVolume(
      [
        { weight: 50, reps: 2, units: null },
        { weight: null, reps: 5, units: 'kg' },
        { weight: 50, reps: null, units: 'kg' },
      ],
      'kg',
    );
    expect(total).toBe(100); // only the first row contributes (50*2)
  });
});
