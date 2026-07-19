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
  // ',' as a decimal separator only in true decimal shape (1-2 fraction
  // digits) — '1,234' thousands-style must fail safe to null, not 1.234.
  const raw = input.trim();
  const trimmed = /^\d*,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw;
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
 * One keypad edit = one session = at most ONE write (spec §1).
 * Replaces the debounce buffer whose empty/stale state caused the
 * wipe-on-blur and partial-value-banking defects.
 */
export interface EditSession {
  /** Text the keypad opened with — '' for an empty field. */
  seedText: string;
  /** Current text in the input. */
  text: string;
}

export function beginEditSession(value: number | null): EditSession {
  const seedText = value == null ? '' : formatValue(value);
  return { seedText, text: seedText };
}

export type EditCommit = { kind: 'noop' } | { kind: 'commit'; value: number | null };

/**
 * Resolve a finished edit session:
 * - untouched (text === seedText) → noop: dismissing an inspected field never changes it
 * - cleared → commit null (deliberate clear)
 * - parseable ('.' or ',' decimals) → commit sanitized
 * - garbage → noop
 */
export function resolveEditCommit(
  session: EditSession,
  sanitize: (n: number) => number,
): EditCommit {
  if (session.text === session.seedText) return { kind: 'noop' };
  if (session.text.trim() === '') return { kind: 'commit', value: null };
  const parsed = parseUserInput(session.text);
  if (parsed == null) return { kind: 'noop' };
  return { kind: 'commit', value: sanitize(parsed) };
}
