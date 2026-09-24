/**
 * In-app Appearance preference (spec docs/specs/2026-09-24-appearance-setting-spec.md).
 *
 * 'system' follows the phone (iOS Appearance, including its sunset-to-sunrise
 * "Automatic" schedule — which is what made the app look dark at night and
 * light in the morning on build 10). 'light' / 'dark' pin the app. Stored on
 * the device, not per user: it is a device preference and survives sign-out
 * on purpose (so it is NOT registered as user-scoped KV). Pure module; the
 * React Native Appearance override lives in useAppearance.ts.
 */
import { getKv, setKv } from '@/lib/kvStore';

export type AppearancePref = 'system' | 'light' | 'dark';

export const APPEARANCE_KV_KEY = 'ui.appearance';

interface AppearanceKvV1 {
  schemaVersion: 1;
  pref: AppearancePref;
}

const PREFS: readonly AppearancePref[] = ['system', 'light', 'dark'];

function isAppearancePref(value: unknown): value is AppearancePref {
  return typeof value === 'string' && (PREFS as readonly string[]).includes(value);
}

/** The scheme to force, or null for "follow the phone". */
export function resolveAppearanceOverride(pref: AppearancePref): 'light' | 'dark' | null {
  return pref === 'system' ? null : pref;
}

export async function loadAppearancePref(): Promise<AppearancePref> {
  const stored = await getKv<AppearanceKvV1>(APPEARANCE_KV_KEY, 1);
  return stored && isAppearancePref(stored.pref) ? stored.pref : 'system';
}

export async function saveAppearancePref(pref: AppearancePref): Promise<void> {
  await setKv<AppearanceKvV1>(APPEARANCE_KV_KEY, { schemaVersion: 1, pref });
}
