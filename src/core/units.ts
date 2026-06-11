/**
 * Weight units and conversion.
 *
 * Weight is stored per set in the unit it was logged in (sets.units). Reads
 * that compare or aggregate across sets (volume, PRs, charts) must convert to a
 * common unit first; single-set displays use the set's own unit. This is the
 * one home for the conversion factor so it can never drift.
 */
import type { Units } from './domain';

export type { Units };

/** Matches the local SQLite + Postgres signup default; the safe fallback unit. */
export const DEFAULT_UNITS: Units = 'kg';

/** Exact international avoirdupois pound. */
const KG_PER_LB = 0.45359237;
const LB_PER_KG = 1 / KG_PER_LB;

export function convertWeight(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  return from === 'lb' ? value * KG_PER_LB : value * LB_PER_KG;
}

export function toKg(value: number, from: Units): number {
  return convertWeight(value, from, 'kg');
}

export interface VolumeSet {
  weight: number | null;
  reps: number | null;
  units: Units | null;
}

/**
 * Total weight×reps across sets, each converted into `target`. A set's own unit
 * is honored (null falls back to DEFAULT_UNITS); sets missing weight or reps
 * contribute nothing.
 */
export function sumVolume(sets: VolumeSet[], target: Units): number {
  let total = 0;
  for (const s of sets) {
    if (s.weight == null || s.reps == null) continue;
    total += convertWeight(s.weight, s.units ?? DEFAULT_UNITS, target) * s.reps;
  }
  return total;
}
