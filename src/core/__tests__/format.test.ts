import {
  ageLabel,
  chartYAxisUnitSuffix,
  formatRelativeDate,
  formatDuration,
  formatPrRowStrip,
  formatRowDate,
  formatShortDate,
  formatStartLabel,
  formatTimeOfDay,
  getDateGroup,
  greetingFor,
  formatMemberSince,
  getInitials,
  identityLines,
  formatWeight,
  humanizeEnum,
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
  // Honest fallback (impeccable batch 5): a still-running workout has no
  // duration to report. Returning null lets every caller drop the segment
  // instead of rendering a bare "· -" next to real data.
  test('returns null when not ended, never a placeholder string', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', null)).toBeNull();
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

  // Layout polish (owner feedback: rows read as unequal rectangles): a
  // sub-minute workout used to render the placeholder-looking "0m" — floor
  // it to an honest "<1m" instead.
  test('floors sub-minute durations to "<1m" instead of "0m"', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', '2026-01-01T10:00:20.000Z')).toBe('<1m');
  });

  test('formats hours and minutes for a 3h5m session', () => {
    expect(formatDuration('2026-01-01T10:00:00.000Z', '2026-01-01T13:05:00.000Z')).toBe('3h 5m');
  });

  // Day-scale sessions (e.g. a forgotten "end workout" tap) used to render
  // an absurd "301h 48m" — switch to day-aware formatting with no minutes.
  test('formats day-scale durations as "Xd Yh", dropping minutes', () => {
    expect(formatDuration('2026-01-01T00:00:00.000Z', '2026-01-13T13:48:00.000Z')).toBe('12d 13h');
  });

  test('formats the exact 24h boundary as "1d 0h"', () => {
    expect(formatDuration('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBe('1d 0h');
  });
});

describe('formatRowDate', () => {
  test('formats a month-short + day label with no weekday or year', () => {
    // 2026-08-10T16:00:00.000Z is noon on Aug 10 in America/New_York (the
    // jest.globalSetup TZ pin), so this is unambiguous under the fixed offset.
    expect(formatRowDate('2026-08-10T16:00:00.000Z')).toBe('Aug 10');
  });
});

describe('humanizeEnum', () => {
  test('replaces underscores with spaces and capitalizes the first letter', () => {
    expect(humanizeEnum('best_volume')).toBe('Best volume');
    expect(humanizeEnum('most_reps_at_weight')).toBe('Most reps at weight');
  });

  test('leaves an already-single word capitalized', () => {
    expect(humanizeEnum('reps')).toBe('Reps');
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

describe('identityLines', () => {
  test('name leads, email demotes to secondary, when a display name exists', () => {
    expect(identityLines('Naren', 'nittuz4@gmail.com')).toEqual({
      headline: 'Naren',
      secondary: 'nittuz4@gmail.com',
    });
  });

  test('trims a display name before using it as the headline', () => {
    expect(identityLines('  Naren  ', 'nittuz4@gmail.com')).toEqual({
      headline: 'Naren',
      secondary: 'nittuz4@gmail.com',
    });
  });

  test('email leads alone when there is no display name', () => {
    expect(identityLines(null, 'nittuz4@gmail.com')).toEqual({
      headline: 'nittuz4@gmail.com',
      secondary: null,
    });
    expect(identityLines(undefined, 'nittuz4@gmail.com')).toEqual({
      headline: 'nittuz4@gmail.com',
      secondary: null,
    });
  });

  test('a whitespace-only display name does not count as having a name', () => {
    expect(identityLines('   ', 'nittuz4@gmail.com')).toEqual({
      headline: 'nittuz4@gmail.com',
      secondary: null,
    });
  });

  test('falls back to an empty headline when neither name nor email is available', () => {
    expect(identityLines(null, undefined)).toEqual({ headline: '', secondary: null });
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

describe('formatPrRowStrip (impeccable polish A)', () => {
  test('drops the "x weight" tail from a loaded reps record so the row never truncates', () => {
    expect(formatPrRowStrip({ weight: 52.5 }, { reps: 13, weight: 52.5 }, 'kg')).toBe(
      'Heaviest 52.5 kg · 13 reps',
    );
  });

  test('a bodyweight reps record keeps the BW token', () => {
    expect(formatPrRowStrip({ weight: 100 }, { reps: 15, weight: null }, 'kg')).toBe(
      'Heaviest 100 kg · 15 BW reps',
    );
  });

  test('renders lb units on the heaviest segment', () => {
    expect(formatPrRowStrip({ weight: 225 }, { reps: 5, weight: 185 }, 'lb')).toBe(
      'Heaviest 225 lb · 5 reps',
    );
  });

  test('missing the heaviest record: only the reps segment renders', () => {
    expect(formatPrRowStrip(null, { reps: 8, weight: 60 }, 'kg')).toBe('8 reps');
  });

  test('missing the reps record: only the heaviest segment renders', () => {
    expect(formatPrRowStrip({ weight: 405 }, null, 'kg')).toBe('Heaviest 405 kg');
  });

  test('neither record present renders an empty string', () => {
    expect(formatPrRowStrip(null, null, 'kg')).toBe('');
  });

  test('trims a trailing ".0" but keeps a real decimal, even for large values', () => {
    expect(formatPrRowStrip({ weight: 300.0 }, { reps: 1, weight: 300.0 }, 'kg')).toBe(
      'Heaviest 300 kg · 1 reps',
    );
    expect(formatPrRowStrip({ weight: 1234.5 }, null, 'kg')).toBe('Heaviest 1234.5 kg');
  });

  test('rounds a long decimal to one place', () => {
    expect(formatPrRowStrip({ weight: 227.349 }, null, 'kg')).toBe('Heaviest 227.3 kg');
  });
});

describe('chartYAxisUnitSuffix (impeccable polish B)', () => {
  test('appends the unit for weight-based metrics', () => {
    expect(chartYAxisUnitSuffix('heaviest', 'kg')).toBe(' kg');
    expect(chartYAxisUnitSuffix('volume', 'kg')).toBe(' kg');
    expect(chartYAxisUnitSuffix('heaviest', 'lb')).toBe(' lb');
  });

  test('reps carry no unit', () => {
    expect(chartYAxisUnitSuffix('reps', 'kg')).toBeUndefined();
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
