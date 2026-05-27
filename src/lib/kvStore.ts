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
