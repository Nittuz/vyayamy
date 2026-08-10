import {
  ageLabel,
  formatRelativeDate,
  formatDuration,
  formatShortDate,
  formatStartLabel,
  formatTimeOfDay,
  getDateGroup,
  greetingFor,
  formatMemberSince,
  getInitials,
  formatWeight,
  localDayKey,
  localDaysBetween,
} from '@/core/format';

/** Build an ISO string `days` whole days before now (noon-anchored to dodge DST/midnight edges). */
function daysAgo(days: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12, 0, 0);
  return d.toISOString();
}

describe('localDayKey (#149)', () => {
  test('keys by the LOCAL calendar day, not the UTC date', () => {
    // 01:00Z on May 2 is 21:00 (9pm) on May 1 in America/New_York.
    expect(localDayKey('2026-05-02T01:00:00.000Z')).toBe('2026-05-01');
    expect(localDayKey('2026-05-02T16:00:00.000Z')).toBe('2026-05-02');
  });
});

describe('localDaysBetween (#150)', () => {
  afterEach(() => jest.useRealTimers());
  test('counts calendar days crossed, not rolling 24h windows', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-02T13:00:00.000Z')); // 9am ET, May 2
    // 11pm ET May 1 — only ~10h earlier, but one calendar day ago.
    expect(localDaysBetween('2026-05-02T03:00:00.000Z')).toBe(1);
    // 8:30am ET May 2 — same calendar day.
    expect(localDaysBetween('2026-05-02T12:30:00.000Z')).toBe(0);
  });
});

describe('formatRelativeDate', () => {
  afterEach(() => jest.useRealTimers());

  test('returns "Today" for now', () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe('Today');
  });

  test('an evening workout reads "Yesterday" the next morning, by calendar (#150)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-02T13:00:00.000Z')); // 9am ET, May 2
    // 11pm ET May 1 — a rolling-24h window would still say "Today" (~10h); the
    // calendar says "Yesterday".
    expect(formatRelativeDate('2026-05-02T03:00:00.000Z')).toBe('Yesterday');
  });

  test('returns "N days ago" for 2-6 days', () => {
    expect(formatRelativeDate(daysAgo(3))).toBe('3 days ago');
  });

  test('returns "1 week ago" for 7-13 days', () => {
    expect(formatRelativeDate(daysAgo(10))).toBe('1 week ago');
  });

  test('returns "N weeks ago" for 14-29 days', () => {
    expect(formatRelativeDate(daysAgo(20))).toBe('2 weeks ago');
  });

  test('falls back to a locale date string beyond 30 days', () => {
    const out = formatRelativeDate(daysAgo(60));
    expect(out).not.toMatch(/ago|Today|Yesterday/);
    expect(typeof out).toBe('string');
  });
});

describe('formatDuration', () => {
  test('returns em-dash when not ended', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', null)).toBe('-');
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

describe('greetingFor', () => {
  // 2026-01-04 is a Sunday.
  test.each([
    [0, 'Sunday night'],
    [4, 'Sunday night'],
    [5, 'Sunday morning'],
    [11, 'Sunday morning'],
    [12, 'Sunday afternoon'],
    [17, 'Sunday afternoon'],
    [18, 'Sunday evening'],
    [23, 'Sunday evening'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(greetingFor(new Date(2026, 0, 4, hour, 0, 0))).toBe(expected);
  });

  test('uses the day of week of the given date', () => {
    expect(greetingFor(new Date(2026, 0, 5, 9, 0, 0))).toBe('Monday morning');
    expect(greetingFor(new Date(2026, 0, 9, 20, 0, 0))).toBe('Friday evening');
  });
});

describe('formatStartLabel', () => {
  test('formats as DAY h:mm in local time', () => {
    // Local-time constructors so the expectation holds in any timezone.
    expect(formatStartLabel(new Date(2026, 0, 5, 9, 5, 0).toISOString())).toBe('MON 9:05');
    expect(formatStartLabel(new Date(2026, 0, 4, 18, 30, 0).toISOString())).toBe('SUN 18:30');
  });

  test('zero-pads minutes but not hours', () => {
    expect(formatStartLabel(new Date(2026, 0, 9, 0, 7, 0).toISOString())).toBe('FRI 0:07');
  });
});

describe('ageLabel', () => {
  afterEach(() => jest.useRealTimers());

  const HOUR = 60 * 60 * 1000;

  test.each([
    [0.5 * HOUR, '0H AGO'],
    [5 * HOUR, '5H AGO'],
    [23 * HOUR, '23H AGO'],
    [30 * HOUR, '1D AGO'],
    [3 * 24 * HOUR, '3D AGO'],
  ])('%i ms old -> %s', (ms, expected) => {
    jest.useFakeTimers();
    const now = new Date('2026-05-31T12:00:00.000Z').getTime();
    jest.setSystemTime(now);
    expect(ageLabel(new Date(now - ms).toISOString())).toBe(expected);
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
    expect(formatWeight(null, 'kg')).toBe('-');
  });

  test('appends the unit', () => {
    expect(formatWeight(100, 'kg')).toBe('100 kg');
    expect(formatWeight(45, 'lb')).toBe('45 lb');
  });
});

describe('formatTimeOfDay', () => {
  test('renders the device-local clock time with minutes (12h or 24h per locale)', () => {
    // Build a local 19:42 instant so the assertion is timezone-independent.
    const local = new Date(2026, 0, 15, 19, 42, 0);
    const out = formatTimeOfDay(local.toISOString());
    expect(out).toMatch(/^(7:42(\s?PM)?|19:42)$/i);
  });
});
