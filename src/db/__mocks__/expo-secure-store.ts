/** expo-secure-store Jest stub — in-memory keychain. */
const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';

export async function setItemAsync(
  key: string,
  value: string,
  _options?: { keychainAccessible?: string },
): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only: wipe the fake keychain between tests. */
export function __reset(): void {
  store.clear();
}
