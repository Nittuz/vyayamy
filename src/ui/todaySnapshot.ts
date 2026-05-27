/**
 * Today screen snapshot — persists render-ready state to AsyncStorage on
 * change; rehydrates synchronously at first paint on cold start.
 *
 * Caching strategy:
 *   - `hydrateSnapshot()` runs on app boot alongside initDb()
 *   - getCachedSnapshot() returns the in-memory cache (synchronous, cheap)
 *   - persistSnapshot() updates both cache and AsyncStorage
 *   - clearSnapshot() runs on sign-out
 *
 * Staleness: snapshots older than 7 days are discarded on hydrate.
 */
import type { ExerciseSeed } from '@/queries/repeatLastWorkout';
import { getKv, removeKv, setKv } from '@/lib/kvStore';

const STORAGE_KEY = '@flexyug/today-snapshot/v1';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1 as const;

export interface TodaySnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  capturedAt: string;
  state: 'active' | 'repeat' | 'empty';
  repeatTitle?: string;
  repeatDaysAgo?: number;
  repeatSeeds?: ExerciseSeed[];
  recentRows: { id: string; title: string; daysAgo: number }[];
}

let cached: TodaySnapshot | null = null;

export function getCachedSnapshot(): TodaySnapshot | null {
  return cached;
}

export async function hydrateSnapshot(): Promise<void> {
  const value = await getKv<TodaySnapshot>(STORAGE_KEY, SCHEMA_VERSION);
  if (!value) {
    cached = null;
    return;
  }
  const age = Date.now() - new Date(value.capturedAt).getTime();
  if (!Number.isFinite(age) || age > STALE_MS || age < 0) {
    cached = null;
    await removeKv(STORAGE_KEY);
    return;
  }
  cached = value;
}

export async function persistSnapshot(snap: TodaySnapshot): Promise<void> {
  cached = snap;
  await setKv(STORAGE_KEY, snap);
}

export async function clearSnapshot(): Promise<void> {
  cached = null;
  await removeKv(STORAGE_KEY);
}

// Test-only: reset the module-level cache between tests
export function __resetCacheForTests(): void {
  cached = null;
}
