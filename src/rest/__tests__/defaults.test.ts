import { restForMuscleGroup } from '@/rest/defaults';

describe('restForMuscleGroup', () => {
  test('compound: chest → 180', () => {
    expect(restForMuscleGroup('Chest')).toBe(180);
  });
  test('compound: back → 180', () => {
    expect(restForMuscleGroup('Back')).toBe(180);
  });
  test('compound: legs → 180', () => {
    expect(restForMuscleGroup('Legs')).toBe(180);
  });
  test('compound: hamstrings → 180', () => {
    expect(restForMuscleGroup('Hamstrings')).toBe(180);
  });
  test('compound: glutes → 180', () => {
    expect(restForMuscleGroup('Glutes')).toBe(180);
  });
  test('medium: shoulders → 90', () => {
    expect(restForMuscleGroup('Shoulders')).toBe(90);
  });
  test('medium: arms → 90', () => {
    expect(restForMuscleGroup('Arms')).toBe(90);
  });
  test('medium: triceps → 90', () => {
    expect(restForMuscleGroup('Triceps')).toBe(90);
  });
  test('medium: calves → 90', () => {
    expect(restForMuscleGroup('Calves')).toBe(90);
  });
  test('isolation: core → 60', () => {
    expect(restForMuscleGroup('Core')).toBe(60);
  });
  test('isolation: abs → 60', () => {
    expect(restForMuscleGroup('Abs')).toBe(60);
  });
  test('isolation: forearms → 60', () => {
    expect(restForMuscleGroup('Forearms')).toBe(60);
  });
  test('case-insensitive: CHEST → 180', () => {
    expect(restForMuscleGroup('CHEST')).toBe(180);
  });
  test('case-insensitive: lEgS → 180', () => {
    expect(restForMuscleGroup('lEgS')).toBe(180);
  });
  test('trimmed: "  chest  " → 180', () => {
    expect(restForMuscleGroup('  chest  ')).toBe(180);
  });
  test('null → 90 (medium default)', () => {
    expect(restForMuscleGroup(null)).toBe(90);
  });
  test('undefined → 90', () => {
    expect(restForMuscleGroup(undefined)).toBe(90);
  });
  test('empty string → 90', () => {
    expect(restForMuscleGroup('')).toBe(90);
  });
  test('unknown muscle group → 90', () => {
    expect(restForMuscleGroup('Earlobe')).toBe(90);
  });
});
