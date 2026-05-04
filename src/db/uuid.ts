/**
 * UUID v4 generator. Uses expo-crypto on native (cryptographically
 * secure) and falls back to Math.random for the test environment.
 */
import * as Crypto from 'expo-crypto';

export function uuidv4(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Fallback for Jest and other environments where the native
    // module isn't available.
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
