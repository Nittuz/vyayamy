/**
 * Per-exercise rest override map, persisted via kvStore.
 *
 * Phase 4: long-press on the RestProgressBar lets the user set a custom
 * rest target for the current exercise. Overrides take precedence over
 * the muscle-group defaults from restDefaults.ts.
 */
import { getKv, setKv } from '@/lib/kvStore';

import { restForMuscleGroup } from './restDefaults';

const STORAGE_KEY = '@flexyug/rest-overrides/v1';
const SCHEMA_VERSION = 1 as const;

interface PersistedOverrides {
  schemaVersion: typeof SCHEMA_VERSION;
  overrides: Record<string, number>;
}

export async function getOverrides(): Promise<Record<string, number>> {
  const value = await getKv<PersistedOverrides>(STORAGE_KEY, SCHEMA_VERSION);
  return value?.overrides ?? {};
}

export async function setOverride(exerciseId: string, seconds: number): Promise<void> {
  const current = await getOverrides();
  current[exerciseId] = seconds;
  await setKv<PersistedOverrides>(STORAGE_KEY, {
    schemaVersion: SCHEMA_VERSION,
    overrides: current,
  });
}

export async function clearOverride(exerciseId: string): Promise<void> {
  const current = await getOverrides();
  if (!(exerciseId in current)) return;
  delete current[exerciseId];
  await setKv<PersistedOverrides>(STORAGE_KEY, {
    schemaVersion: SCHEMA_VERSION,
    overrides: current,
  });
}

export function effectiveRest(
  overrides: Record<string, number>,
  exerciseId: string,
  muscleGroup: string | null | undefined,
): number {
  const override = overrides[exerciseId];
  if (typeof override === 'number') return override;
  return restForMuscleGroup(muscleGroup);
}
