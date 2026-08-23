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
