/**
 * UUID v4 generator. Uses expo-crypto on native (cryptographically secure).
 *
 * The Math.random fallback exists strictly for non-RN runtimes (Jest under
 * Node, where the dedicated mock at __mocks__/expo-crypto.ts already returns
 * a v4 — but we keep the fallback in case a test imports this file before
 * jest's module mapper wires the mock in). It is gated to NODE_ENV === 'test'
 * so a transient native-bridge issue in production fails loudly instead of
 * silently degrading to a non-cryptographic UUID.
 */
import * as Crypto from 'expo-crypto';

export function uuidv4(): string {
  try {
    return Crypto.randomUUID();
  } catch (err) {
    if (process.env.NODE_ENV === 'test') {
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
