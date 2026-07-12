/**
 * Pure logic for NumericStepper — separated from the JSX wrapper so
 * it can be unit-tested in Jest (which cannot render React Native
 * components in this project's setup).
 */
import { useEffect, useRef } from 'react';

export function applyStep(
  current: number | null,
  step: number,
  direction: 1 | -1,
  min: number = 0,
): number {
  const base = current ?? 0;
  const next = base + step * direction;
  if (next < min) return min;
  return roundToStep(next);
}

export function clampValue(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Clamp a committed value to a sane range (and round to an integer for reps), so
 * a fat-fingered keypad entry can't push a negative/huge/fractional value into
 * SQLite and sync (#19). Weight keeps decimals; reps are whole numbers.
 */
export function sanitizeNumber(
  n: number,
  opts: { min: number; max: number; integer?: boolean },
): number {
  const rounded = opts.integer ? Math.round(n) : n;
  return clampValue(rounded, opts.min, opts.max);
}

export function formatValue(value: number | null): string {
  if (value == null) return '-';
  if (Number.isInteger(value)) return String(value);
  // Drop trailing zeros (22.50 → 22.5; 22.0 → 22)
  return parseFloat(value.toFixed(2)).toString();
}

export function parseUserInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundToStep(value: number): number {
  // Avoid floating-point dust from 0.5 increments (e.g. 22.5 + 2.5 → 25.0000001)
  return Math.round(value * 1000) / 1000;
}

/**
 * Debounced commit helper for NumericStepperView's keypad mode.
 *
 * Each call to bufferKeystroke restarts a timer. When the timer fires, the
 * buffered text is parsed via parseUserInput; valid numbers (and empty=null)
 * call onChange exactly once. flushNow cancels the pending timer and commits
 * the buffer immediately (called on blur). cancelPending clears the timer
 * without committing (called on unmount).
 *
 * Pure logic in TypeScript — the React hook is a thin wrapper that ensures
 * the closure dies with the component.
 */
export interface DebouncedCommit {
  bufferKeystroke: (rawText: string) => void;
  flushNow: () => void;
  cancelPending: () => void;
}

export function useDebouncedCommit(
  onChange: (next: number | null) => void,
  debounceMs: number,
  sanitize: (n: number) => number = (n) => n,
): DebouncedCommit {
  const bufferRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const sanitizeRef = useRef(sanitize);

  // Keep onChange/sanitize fresh without re-creating the hook contract every render
  useEffect(() => {
    onChangeRef.current = onChange;
    sanitizeRef.current = sanitize;
  }, [onChange, sanitize]);

  const commit = () => {
    const text = bufferRef.current;
    if (text.trim() === '') {
      onChangeRef.current(null);
      return;
    }
    const n = Number(text.trim());
    if (Number.isFinite(n)) {
      // Clamp/round before it reaches SQLite + sync (#19).
      onChangeRef.current(sanitizeRef.current(n));
    }
    // invalid → no-op
  };

  const bufferKeystroke = (rawText: string) => {
    bufferRef.current = rawText;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit();
    }, debounceMs);
  };

  const flushNow = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commit();
  };

  const cancelPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { bufferKeystroke, flushNow, cancelPending };
}
