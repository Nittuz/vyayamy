/**
 * Encrypted at-rest storage for the Supabase session (#88).
 *
 * Pattern: the official Supabase RN "LargeSecureStore" — a fresh 256-bit
 * AES key per write lives in the iOS Keychain (expo-secure-store,
 * AFTER_FIRST_UNLOCK so background token refresh keeps working); the
 * AES-CTR ciphertext lives in AsyncStorage, because sessions can exceed
 * the Keychain's ~4KB practical limit. A fresh key per write means the
 * CTR counter can always start at 1 — no IV bookkeeping.
 *
 * Legacy migration: pre-#88 builds stored the session as plaintext JSON
 * under the same AsyncStorage key. Plaintext starts with '{'; our
 * ciphertext is hex, so first read detects, re-encrypts in place, and
 * returns the value — the user never re-logs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const keychainKeyFor = (storageKey: string) => `flexyug.aeskey.${storageKey}`;

async function encrypt(storageKey: string, value: string): Promise<string> {
  const keyBytes = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  const ciphertext = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keychainKeyFor(storageKey), aesjs.utils.hex.fromBytes(keyBytes), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return aesjs.utils.hex.fromBytes(ciphertext);
}

async function decrypt(storageKey: string, hexCiphertext: string): Promise<string | null> {
  const keyHex = await SecureStore.getItemAsync(keychainKeyFor(storageKey));
  if (!keyHex) return null; // keychain entry lost → treat as signed out, never return garbage
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    new aesjs.Counter(1),
  );
  const plaintext = cipher.decrypt(aesjs.utils.hex.toBytes(hexCiphertext));
  return aesjs.utils.utf8.fromBytes(plaintext);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (stored == null) return null;
    if (stored.startsWith('{')) {
      // Legacy plaintext session — encrypt in place, then hand it back.
      await secureSessionStorage.setItem(key, stored);
      return stored;
    }
    return decrypt(key, stored);
  },

  async setItem(key: string, value: string): Promise<void> {
    const ciphertext = await encrypt(key, value);
    await AsyncStorage.setItem(key, ciphertext);
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keychainKeyFor(key));
  },
};
