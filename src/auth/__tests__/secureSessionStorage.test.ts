/**
 * #88 — session-at-rest encryption. The adapter must round-trip the
 * Supabase session, keep only ciphertext in AsyncStorage, migrate the
 * legacy plaintext blob from pre-#88 builds, and tear down both halves
 * on removeItem (sign-out path).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { secureSessionStorage } from '../secureSessionStorage';

// Replace jest.setup.js's stateless AsyncStorage stub with the official
// stateful mock — migration and round-trip tests need real reads-after-writes.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/errorReporting', () => ({ captureException: jest.fn() }));

const KEY = 'sb-oqwpjksgnwthqmgeqrnu-auth-token';
const SESSION = JSON.stringify({ access_token: 'jwt-abc123', refresh_token: 'refresh-xyz' });

beforeEach(async () => {
  await AsyncStorage.clear();
  (SecureStore as unknown as { __reset(): void }).__reset();
});

test('round-trips a session', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
});

test('AsyncStorage holds only ciphertext after setItem', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).not.toBeNull();
  expect(raw).not.toContain('jwt-abc123');
  expect(raw!.startsWith('{')).toBe(false);
});

test('migrates a legacy plaintext session on first read', async () => {
  await AsyncStorage.setItem(KEY, SESSION); // what a pre-#88 build left behind
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).not.toContain('jwt-abc123'); // re-stored encrypted in place
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION); // still readable
});

test('returns null when nothing is stored', async () => {
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test('returns null, not garbage, when the keychain entry is gone', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await SecureStore.deleteItemAsync(`flexyug.aeskey.${KEY}`);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test('removeItem clears both the blob and the keychain key', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  await secureSessionStorage.removeItem(KEY);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
  await expect(SecureStore.getItemAsync(`flexyug.aeskey.${KEY}`)).resolves.toBeNull();
});

test('getItem resolves null (not a rejection) when the Keychain read throws', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  (SecureStore as unknown as { __failNext(method: string): void }).__failNext('getItemAsync');
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
});

test('removeItem resolves (does not throw) when the Keychain delete throws', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  (SecureStore as unknown as { __failNext(method: string): void }).__failNext('deleteItemAsync');
  await expect(secureSessionStorage.removeItem(KEY)).resolves.toBeUndefined();
  // The AsyncStorage half is still torn down even though the Keychain call failed.
  await expect(AsyncStorage.getItem(KEY)).resolves.toBeNull();
});

test('setItem rejects when the Keychain write throws', async () => {
  (SecureStore as unknown as { __failNext(method: string): void }).__failNext('setItemAsync');
  await expect(secureSessionStorage.setItem(KEY, SESSION)).rejects.toThrow();
});

test('decrypting under the wrong key yields garbage, not the original session, not a throw', async () => {
  await secureSessionStorage.setItem(KEY, SESSION);
  const oldCiphertext = await AsyncStorage.getItem(KEY);
  await secureSessionStorage.setItem(KEY, SESSION); // rotates to a fresh key
  await AsyncStorage.setItem(KEY, oldCiphertext!); // restore ciphertext encrypted under the old key
  const result = await secureSessionStorage.getItem(KEY);
  expect(result).not.toBeNull();
  expect(result).not.toBe(SESSION);
});

test('migrates a legacy plaintext PKCE code verifier (JSON string) on first read', async () => {
  const verifier = JSON.stringify('a-code-verifier');
  await AsyncStorage.setItem(KEY, verifier);
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(verifier);
  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).not.toBe(verifier); // re-stored encrypted in place
  await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(verifier); // still readable
});
