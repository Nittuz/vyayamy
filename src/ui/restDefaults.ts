/**
 * Muscle-group → default rest seconds lookup.
 *
 * Three tiers (Phase 3 — no per-user override yet, no schema column):
 *   180s — compound, larger muscle groups
 *   90s  — medium / generic fallback
 *   60s  — isolation
 *
 * Lookup is case-insensitive and trimmed. Null/empty/unknown falls back to 90s.
 */

const COMPOUND = new Set([
  'chest',
  'back',
  'legs',
  'quads',
  'quadriceps',
  'hamstrings',
  'glutes',
  'posterior',
]);

const ISOLATION = new Set([
  'core',
  'abs',
  'obliques',
  'forearms',
  'grip',
]);

const MEDIUM_DEFAULT = 90;

export function restForMuscleGroup(muscleGroup: string | null | undefined): number {
  if (muscleGroup == null) return MEDIUM_DEFAULT;
  const key = muscleGroup.trim().toLowerCase();
  if (key === '') return MEDIUM_DEFAULT;
  if (COMPOUND.has(key)) return 180;
  if (ISOLATION.has(key)) return 60;
  return MEDIUM_DEFAULT;
}
