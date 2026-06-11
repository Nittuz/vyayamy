/**
 * Thin AsyncStorage wrapper with schema-version handling.
 *
 * Every stored value MUST include a `schemaVersion: number` field. Consumers
 * pass an expected version; mismatches return null AND clear the key (so old
 * data doesn't pollute future reads).
 *
 * All errors are swallowed and logged — KV is best-effort UX storage, never
 * a source of truth.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Versioned {
  schemaVersion: number;
}

export async function getKv<T extends Versioned>(
  key: string,
  expectedVersion: T['schemaVersion'],
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as T;
    if (parsed.schemaVersion !== expectedVersion) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // give up — KV is best-effort
    }
    return null;
  }
}

export async function setKv<T extends Versioned>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // give up — KV is best-effort
  }
}

export async function removeKv(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // give up — KV is best-effort
  }
}

// --- User-scoped KV registry (#36) ----------------------------------------
//
// Per-user UI state (Today snapshot, rest overrides, the live rest timer) lives
// in AsyncStorage and must be wiped on sign-out so the next account never sees
// it. Previously the sync engine imported each UI module to clear its key — a
// layering violation. Instead, UI modules register their own keys here, and the
// engine just calls clearAllUserScopedKv(). The dependency now points the right
// way (sync → lib, never sync → ui).

type ClearHook = () => void;
const userScopedKeys: { key: string; onClear?: ClearHook }[] = [];

/** Register a per-user KV key (plus an optional in-memory reset) to be wiped on
 *  sign-out. Idempotent per key. Call at module load. */
export function registerUserScopedKv(key: string, onClear?: ClearHook): void {
  if (!userScopedKeys.some((e) => e.key === key)) {
    userScopedKeys.push({ key, onClear });
  }
}

/** Wipe every registered per-user key and run its in-memory reset. */
export async function clearAllUserScopedKv(): Promise<void> {
  await Promise.all(
    userScopedKeys.map(async ({ key, onClear }) => {
      await removeKv(key);
      try {
        onClear?.();
      } catch {
        // best-effort
      }
    }),
  );
}
