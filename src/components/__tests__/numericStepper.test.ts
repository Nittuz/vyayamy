import {
  applyStep,
  clampValue,
  formatValue,
  parseUserInput,
} from '@/components/numericStepper';

describe('applyStep', () => {
  test('increments by step in positive direction', () => {
    expect(applyStep(185, 5, 1)).toBe(190);
  });
  test('decrements by step in negative direction', () => {
    expect(applyStep(185, 5, -1)).toBe(180);
  });
  test('handles null current as starting from 0', () => {
    expect(applyStep(null, 5, 1)).toBe(5);
  });
  test('handles fractional steps (kg)', () => {
    expect(applyStep(20, 2.5, 1)).toBe(22.5);
  });
  test('cannot go below zero by default', () => {
    expect(applyStep(2, 5, -1)).toBe(0);
  });
});

describe('clampValue', () => {
  test('clamps below min', () => {
    expect(clampValue(-5, 0, 1000)).toBe(0);
  });
  test('clamps above max', () => {
    expect(clampValue(2000, 0, 1000)).toBe(1000);
  });
  test('passes valid value through', () => {
    expect(clampValue(185, 0, 1000)).toBe(185);
  });
});

describe('formatValue', () => {
  test('returns en-dash for null', () => {
    expect(formatValue(null)).toBe('–');
  });
  test('returns integer without decimal', () => {
    expect(formatValue(185)).toBe('185');
  });
  test('returns one decimal for fractional', () => {
    expect(formatValue(22.5)).toBe('22.5');
  });
  test('drops trailing zeros', () => {
    expect(formatValue(22.0)).toBe('22');
  });
});

describe('parseUserInput', () => {
  test('parses valid integer', () => {
    expect(parseUserInput('185')).toBe(185);
  });
  test('parses valid decimal', () => {
    expect(parseUserInput('22.5')).toBe(22.5);
  });
  test('returns null for empty', () => {
    expect(parseUserInput('')).toBeNull();
  });
  test('returns null for non-numeric', () => {
    expect(parseUserInput('abc')).toBeNull();
  });
  test('handles leading + trailing whitespace', () => {
    expect(parseUserInput('  185  ')).toBe(185);
  });
});
