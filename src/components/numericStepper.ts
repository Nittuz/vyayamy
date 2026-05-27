/**
 * Pure logic for NumericStepper — separated from the JSX wrapper so
 * it can be unit-tested in Jest (which cannot render React Native
 * components in this project's setup).
 */

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

export function formatValue(value: number | null): string {
  if (value == null) return '–';
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
