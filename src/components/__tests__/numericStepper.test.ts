import { act, renderHook } from '@testing-library/react-native';

import {
  applyStep,
  beginEditSession,
  clampValue,
  formatValue,
  parseUserInput,
  resolveEditCommit,
  sanitizeNumber,
  useDebouncedCommit,
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
    expect(formatValue(null)).toBe('-');
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

describe('sanitizeNumber (#19)', () => {
  test('clamps to [min, max]', () => {
    expect(sanitizeNumber(-5, { min: 0, max: 1500 })).toBe(0);
    expect(sanitizeNumber(99999, { min: 0, max: 1500 })).toBe(1500);
    expect(sanitizeNumber(102.5, { min: 0, max: 1500 })).toBe(102.5); // decimals kept for weight
  });
  test('rounds to an integer when asked (reps)', () => {
    expect(sanitizeNumber(5.7, { min: 0, max: 200, integer: true })).toBe(6);
    expect(sanitizeNumber(12.2, { min: 0, max: 200, integer: true })).toBe(12);
  });
});

describe('useDebouncedCommit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not call onChange until debounce elapses', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('1'));
    act(() => result.current.bufferKeystroke('18'));
    act(() => result.current.bufferKeystroke('185'));
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(185);
  });

  test('restarts the timer on each keystroke', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('1'));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => result.current.bufferKeystroke('18'));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(onChange).not.toHaveBeenCalled(); // 400ms total, but reset at 200
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(18);
  });

  test('flushNow commits immediately and cancels pending timer', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('185'));
    act(() => result.current.flushNow());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(185);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(1); // no double-fire
  });

  test('empty buffer commits null', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke(''));
    act(() => result.current.flushNow());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('invalid text does not commit', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('abc'));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('cancelPending clears the timer without committing', () => {
    const onChange = jest.fn();
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250));
    act(() => result.current.bufferKeystroke('185'));
    act(() => result.current.cancelPending());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('applies the sanitizer to committed keypad input (#19)', () => {
    const onChange = jest.fn();
    const sanitize = (n: number) => sanitizeNumber(n, { min: 0, max: 200, integer: true });
    const { result } = renderHook(() => useDebouncedCommit(onChange, 250, sanitize));
    act(() => result.current.bufferKeystroke('999')); // above the reps max
    act(() => result.current.flushNow());
    expect(onChange).toHaveBeenCalledWith(200);
  });
});

describe('edit session (spec §1 — one edit session, one write)', () => {
  const sanitize = (n: number) => Math.min(Math.max(n, 0), 1500);

  test('beginEditSession seeds from the value; empty value seeds empty text', () => {
    expect(beginEditSession(60)).toEqual({ seedText: '60', text: '60' });
    expect(beginEditSession(22.5)).toEqual({ seedText: '22.5', text: '22.5' });
    expect(beginEditSession(null)).toEqual({ seedText: '', text: '' });
  });

  test('untouched session is a no-op — the wipe-on-blur fix', () => {
    const s = beginEditSession(60); // open keypad, type nothing, dismiss
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });

  test('untouched EMPTY session is also a no-op (not a null commit)', () => {
    const s = beginEditSession(null);
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });

  test('deliberately cleared text commits null', () => {
    const s = { ...beginEditSession(60), text: '' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: null });
  });

  test('typed number commits sanitized', () => {
    const s = { ...beginEditSession(null), text: '9999' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: 1500 });
  });

  test('locale comma parses as a decimal separator (defect: 62,5 silently dropped)', () => {
    const s = { ...beginEditSession(60), text: '62,5' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'commit', value: 62.5 });
  });

  test('garbage text is a no-op, not a wipe', () => {
    const s = { ...beginEditSession(60), text: '6.2.5' };
    expect(resolveEditCommit(s, sanitize)).toEqual({ kind: 'noop' });
  });
});

describe('parseUserInput — comma decimals', () => {
  test('accepts comma as decimal separator', () => {
    expect(parseUserInput('62,5')).toBe(62.5);
  });
});
