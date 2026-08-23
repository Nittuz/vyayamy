/** expo-secure-store Jest stub — in-memory keychain. */
const store = new Map<string, string>();

type Method = 'setItemAsync' | 'getItemAsync' | 'deleteItemAsync';
let failNext: { method: Method; error: Error } | null = null;

function maybeFail(method: Method): void {
  if (failNext && failNext.method === method) {
    const { error } = failNext;
    failNext = null;
    throw error;
  }
}

export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';

export async function setItemAsync(
  key: string,
  value: string,
  _options?: { keychainAccessible?: string },
): Promise<void> {
  maybeFail('setItemAsync');
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  maybeFail('getItemAsync');
  return store.get(key) ?? null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  maybeFail('deleteItemAsync');
  store.delete(key);
}

/** Test-only: wipe the fake keychain between tests. */
export function __reset(): void {
  store.clear();
  failNext = null;
}

/** Test-only: make the next call to `method` reject once. */
export function __failNext(method: Method, error: Error = new Error(`${method} failed`)): void {
  failNext = { method, error };
}
