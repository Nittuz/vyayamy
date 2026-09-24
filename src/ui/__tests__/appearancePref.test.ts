/**
 * In-app Appearance setting (spec 2026-09-24): System / Light / Dark, stored
 * on the device (not per user — it is a device preference), applied through
 * React Native's Appearance override so native surfaces follow too.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APPEARANCE_KV_KEY,
  loadAppearancePref,
  resolveAppearanceOverride,
  saveAppearancePref,
} from '@/ui/appearancePref';

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store[k] = v;
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    delete store[k];
  });
});

test('system means no override; light and dark force that scheme', () => {
  expect(resolveAppearanceOverride('system')).toBeNull();
  expect(resolveAppearanceOverride('light')).toBe('light');
  expect(resolveAppearanceOverride('dark')).toBe('dark');
});

test('defaults to system when nothing is stored', async () => {
  expect(await loadAppearancePref()).toBe('system');
});

test('round-trips a saved preference', async () => {
  await saveAppearancePref('dark');
  expect(await loadAppearancePref()).toBe('dark');
  expect(store[APPEARANCE_KV_KEY]).toContain('"dark"');
});

test('an unknown stored value falls back to system', async () => {
  store[APPEARANCE_KV_KEY] = JSON.stringify({ schemaVersion: 1, pref: 'sepia' });
  expect(await loadAppearancePref()).toBe('system');
});
