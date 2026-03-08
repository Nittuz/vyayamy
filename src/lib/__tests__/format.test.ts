import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatRelativeDate,
  formatDuration,
  formatShortDate,
  getDateGroup,
  getGreeting,
} from '../format';

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T14:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns "Today" for today', () => {
    expect(formatRelativeDate('2026-03-08T10:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    expect(formatRelativeDate('2026-03-07T10:00:00Z')).toBe('Yesterday');
  });

  it('returns "X days ago" for 2-6 days', () => {
    expect(formatRelativeDate('2026-03-05T10:00:00Z')).toBe('3 days ago');
  });

  it('returns "1 week ago" for 7-13 days', () => {
    expect(formatRelativeDate('2026-03-01T10:00:00Z')).toBe('1 week ago');
  });

  it('returns "X weeks ago" for 14-29 days', () => {
    expect(formatRelativeDate('2026-02-20T10:00:00Z')).toBe('2 weeks ago');
  });

  it('returns locale date for 30+ days', () => {
    const result = formatRelativeDate('2026-01-01T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('Today');
  });
});

describe('formatDuration', () => {
  it('returns "—" when endedAt is null', () => {
    expect(formatDuration('2026-03-08T10:00:00Z', null)).toBe('—');
  });

  it('returns minutes for < 60 min', () => {
    expect(formatDuration('2026-03-08T10:00:00Z', '2026-03-08T10:45:00Z')).toBe('45m');
  });

  it('returns hours and minutes', () => {
    expect(formatDuration('2026-03-08T10:00:00Z', '2026-03-08T11:30:00Z')).toBe('1h 30m');
  });

  it('returns just hours when no remainder', () => {
    expect(formatDuration('2026-03-08T10:00:00Z', '2026-03-08T12:00:00Z')).toBe('2h');
  });
});

describe('formatShortDate', () => {
  it('returns a formatted short date', () => {
    const result = formatShortDate('2026-03-08T10:00:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('getDateGroup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T14:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns "Today" for today', () => {
    expect(getDateGroup('2026-03-08T10:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    expect(getDateGroup('2026-03-07T10:00:00Z')).toBe('Yesterday');
  });

  it('returns "This week" for 2-6 days ago', () => {
    expect(getDateGroup('2026-03-05T10:00:00Z')).toBe('This week');
  });

  it('returns "This month" for 7-29 days ago', () => {
    expect(getDateGroup('2026-02-28T10:00:00Z')).toBe('This month');
  });
});

describe('getGreeting', () => {
  afterEach(() => vi.useRealTimers());

  it('returns "Good morning" before noon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T09:00:00'));
    expect(getGreeting()).toBe('Good morning');
  });

  it('returns "Good afternoon" from noon to 5pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T14:00:00'));
    expect(getGreeting()).toBe('Good afternoon');
  });

  it('returns "Good evening" after 5pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T19:00:00'));
    expect(getGreeting()).toBe('Good evening');
  });
});
