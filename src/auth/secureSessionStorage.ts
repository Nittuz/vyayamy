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
 * (starts with '{') or, for a stored PKCE code verifier, a plain JSON
 * string (starts with '"'); our ciphertext is hex, so first read detects
 * either legacy shape, re-encrypts in place, and returns the value — the
 * user never re-logs.
 *
 * Randomness: `Crypto.getRandomBytes` uses the native CSPRNG in release
 * builds. Under `__DEV__` with remote JS debugging attached, Expo's JS
 * runtime falls back to `Math.random` — fine for dev iteration, not a
 * security boundary; release builds never take that path.
 *
 * Error handling: getItem never throws. A failed AsyncStorage read or a
 * failed Keychain read/decrypt resolves to `null`, which auth-js treats
 * as "no session" and routes to re-login. The one carve-out: if the
 * one-time legacy-plaintext migration write fails, getItem still hands
 * back the plaintext value (it's a valid session on its own) instead of
 * turning it into `null` — the next read just retries the migration.
 * removeItem never throws either, on either of its two steps — the
 * sign-out path must complete even if the AsyncStorage or Keychain
 * delete fails, otherwise supabase-js's `_removeSession` never emits
 * `SIGNED_OUT` and local DB/cache teardown for the outgoing user never
 * runs. setItem is the one method that rethrows: a session that
 * silently failed to persist is worse than a visible failure.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { captureException } from '@/lib/errorReporting';

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
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored == null) return null;
      if (stored.startsWith('{') || stored.startsWith('"')) {
        // Legacy plaintext value (session JSON, or a PKCE code verifier
        // stored as a bare JSON string) — encrypt in place, hand it back.
        try {
          await secureSessionStorage.setItem(key, stored);
        } catch (err) {
          // The migration write failed (setItem already reported it),
          // but the plaintext we just read is still a valid session —
          // hand it back rather than turning a readable session into
          // null. The next read retries the migration.
          captureException(err, { where: 'secureSessionStorage.getItem (migration)' });
        }
        return stored;
      }
      return await decrypt(key, stored);
    } catch (err) {
      // Any other failure (AsyncStorage read, missing/rotated Keychain
      // key, corrupt ciphertext) is treated as no-session rather than
      // propagated — auth-js reads null as signed-out and routes to
      // re-login instead of crashing.
      captureException(err, { where: 'secureSessionStorage.getItem' });
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const ciphertext = await encrypt(key, value);
      await AsyncStorage.setItem(key, ciphertext);
    } catch (err) {
      captureException(err, { where: 'secureSessionStorage.setItem' });
      throw err;
    }
  },

  async removeItem(key: string): Promise<void> {
    // Both halves are wrapped independently (not one try around both) so
    // a failure on the first doesn't skip the second — either failure
    // must not reject, since letting it propagate would abort
    // supabase-js's `_removeSession` before it emits SIGNED_OUT, and
    // local DB/cache teardown for the old user would never run.
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      captureException(err, { where: 'secureSessionStorage.removeItem (AsyncStorage)' });
    }
    try {
      await SecureStore.deleteItemAsync(keychainKeyFor(key));
    } catch (err) {
      captureException(err, { where: 'secureSessionStorage.removeItem (Keychain)' });
    }
  },
};
