import {
  formatRelativeDate,
  formatDuration,
  formatShortDate,
  getDateGroup,
  getGreeting,
  formatMemberSince,
  getInitials,
  formatWeight,
} from '@/core/format';

const DAY = 24 * 60 * 60 * 1000;

/** Build an ISO string `days` whole days before now (noon-anchored to dodge DST/midnight edges). */
function daysAgo(days: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12, 0, 0);
  return d.toISOString();
}

describe('formatRelativeDate', () => {
  test('returns "Today" for now', () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe('Today');
  });

  test('returns "Yesterday" for ~1 day ago', () => {
    expect(formatRelativeDate(new Date(Date.now() - DAY - 1000).toISOString())).toBe('Yesterday');
  });

  test('returns "N days ago" for 2-6 days', () => {
    expect(formatRelativeDate(new Date(Date.now() - 3 * DAY - 1000).toISOString())).toBe('3 days ago');
  });

  test('returns "1 week ago" for 7-13 days', () => {
    expect(formatRelativeDate(new Date(Date.now() - 10 * DAY).toISOString())).toBe('1 week ago');
  });

  test('returns "N weeks ago" for 14-29 days', () => {
    expect(formatRelativeDate(new Date(Date.now() - 20 * DAY).toISOString())).toBe('2 weeks ago');
  });

  test('falls back to a locale date string beyond 30 days', () => {
    const out = formatRelativeDate(new Date(Date.now() - 60 * DAY).toISOString());
    expect(out).not.toMatch(/ago|Today|Yesterday/);
    expect(typeof out).toBe('string');
  });
});

describe('formatDuration', () => {
  test('returns em-dash when not ended', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', null)).toBe('—');
  });

  test('formats sub-hour durations as minutes', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', '2026-01-01T10:45:00.000Z')).toBe('45m');
  });

  test('formats a whole-hour duration without trailing minutes', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z')).toBe('1h');
  });

  test('formats hours and minutes', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', '2026-01-01T12:05:00.000Z')).toBe('2h 5m');
  });
});

describe('formatShortDate / formatMemberSince', () => {
  test('return non-empty strings', () => {
    expect(formatShortDate('2026-01-15T00:00:00.000Z').length).toBeGreaterThan(0);
    expect(formatMemberSince('2026-01-15T00:00:00.000Z').length).toBeGreaterThan(0);
  });
});

describe('getDateGroup', () => {
  test('returns "Today" for today', () => {
    expect(getDateGroup(daysAgo(0))).toBe('Today');
  });

  test('returns "Yesterday" for yesterday', () => {
    expect(getDateGroup(daysAgo(1))).toBe('Yesterday');
  });

  test('returns "This week" within 7 days', () => {
    expect(getDateGroup(daysAgo(3))).toBe('This week');
  });

  test('returns "This month" within 30 days', () => {
    expect(getDateGroup(daysAgo(10))).toBe('This month');
  });

  test('returns a month/year label beyond 30 days', () => {
    const out = getDateGroup(daysAgo(90));
    expect(out).not.toMatch(/Today|Yesterday|This week|This month/);
  });
});

describe('getGreeting', () => {
  afterEach(() => jest.useRealTimers());

  test.each([
    [8, 'Good morning'],
    [13, 'Good afternoon'],
    [20, 'Good evening'],
  ])('hour %i -> %s', (hour, expected) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 1, hour, 0, 0));
    expect(getGreeting()).toBe(expected);
  });
});

describe('getInitials', () => {
  test('uses first + last initials for multi-word names', () => {
    expect(getInitials('John Doe', undefined)).toBe('JD');
    expect(getInitials('Mary Jane Watson', undefined)).toBe('MW');
  });

  test('uses first two letters for a single-word name', () => {
    expect(getInitials('Madonna', undefined)).toBe('MA');
  });

  test('collapses extra whitespace', () => {
    expect(getInitials('  John   Doe  ', undefined)).toBe('JD');
  });

  test('falls back to email initial when display name is blank', () => {
    expect(getInitials('   ', 'alice@example.com')).toBe('A');
    expect(getInitials(null, 'bob@example.com')).toBe('B');
  });

  test('returns "?" when nothing is available', () => {
    expect(getInitials(null, undefined)).toBe('?');
  });
});

describe('formatWeight', () => {
  test('returns em-dash for null weight', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
  });

  test('appends the unit', () => {
    expect(formatWeight(100, 'kg')).toBe('100 kg');
    expect(formatWeight(45, 'lb')).toBe('45 lb');
  });
});
