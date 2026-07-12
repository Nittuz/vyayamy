/**
 * Per-exercise rest override map, persisted via kvStore.
 *
 * Phase 4: long-press on the RestProgressBar lets the user set a custom
 * rest target for the current exercise. Overrides take precedence over
 * the muscle-group defaults from defaults.ts.
 */
import { getKv, registerUserScopedKv, setKv } from '@/lib/kvStore';

import { restForMuscleGroup } from './defaults';

export const REST_OVERRIDES_KEY = '@flexyug/rest-overrides/v1';
const SCHEMA_VERSION = 1 as const;

// Per-user — wiped on sign-out via the registry (#36).
registerUserScopedKv(REST_OVERRIDES_KEY);

interface PersistedOverrides {
  schemaVersion: typeof SCHEMA_VERSION;
  overrides: Record<string, number>;
}

export async function getOverrides(): Promise<Record<string, number>> {
  const value = await getKv<PersistedOverrides>(REST_OVERRIDES_KEY, SCHEMA_VERSION);
  return value?.overrides ?? {};
}

export async function setOverride(exerciseId: string, seconds: number): Promise<void> {
  const current = await getOverrides();
  current[exerciseId] = seconds;
  await setKv<PersistedOverrides>(REST_OVERRIDES_KEY, {
    schemaVersion: SCHEMA_VERSION,
    overrides: current,
  });
}

export async function clearOverride(exerciseId: string): Promise<void> {
  const current = await getOverrides();
  if (!(exerciseId in current)) return;
  delete current[exerciseId];
  await setKv<PersistedOverrides>(REST_OVERRIDES_KEY, {
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
