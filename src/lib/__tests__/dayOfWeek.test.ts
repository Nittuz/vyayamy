import { dayOfWeek } from '@/lib/dayOfWeek';

describe('dayOfWeek', () => {
  // 2026-05-25 is a Monday (verified via JS Date)
  test('Monday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-25T12:00:00Z'))).toBe('Monday');
  });
  test('Tuesday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-26T12:00:00Z'))).toBe('Tuesday');
  });
  test('Wednesday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-27T12:00:00Z'))).toBe('Wednesday');
  });
  test('Thursday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-28T12:00:00Z'))).toBe('Thursday');
  });
  test('Friday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-29T12:00:00Z'))).toBe('Friday');
  });
  test('Saturday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-30T12:00:00Z'))).toBe('Saturday');
  });
  test('Sunday from Date', () => {
    expect(dayOfWeek(new Date('2026-05-31T12:00:00Z'))).toBe('Sunday');
  });
  test('from ISO string', () => {
    expect(dayOfWeek('2026-05-26T12:00:00Z')).toBe('Tuesday');
  });
  test('from epoch ms', () => {
    const tuesdayMs = new Date('2026-05-26T12:00:00Z').getTime();
    expect(dayOfWeek(tuesdayMs)).toBe('Tuesday');
  });
});
