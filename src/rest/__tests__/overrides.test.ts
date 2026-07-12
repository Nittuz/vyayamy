import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearOverride,
  effectiveRest,
  getOverrides,
  REST_OVERRIDES_KEY,
  setOverride,
} from '@/rest/overrides';

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

describe('persistence contract', () => {
  // The storage key is a persisted contract with users' devices. Moving the
  // module (e.g. #41's src/rest consolidation) must NEVER change it, or
  // existing overrides would silently vanish.
  test('storage key string is frozen', () => {
    expect(REST_OVERRIDES_KEY).toBe('@flexyug/rest-overrides/v1');
  });

  test('persisted payload carries schemaVersion 1', async () => {
    await setOverride('ex-1', 120);
    expect(JSON.parse(store[REST_OVERRIDES_KEY] ?? 'null')?.schemaVersion).toBe(1);
  });
});

describe('getOverrides / setOverride / clearOverride', () => {
  test('getOverrides returns empty map when nothing stored', async () => {
    expect(await getOverrides()).toEqual({});
  });

  test('setOverride then getOverrides round-trips', async () => {
    await setOverride('ex-1', 120);
    expect(await getOverrides()).toEqual({ 'ex-1': 120 });
  });

  test('setOverride merges with existing', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-2', 180);
    expect(await getOverrides()).toEqual({ 'ex-1': 120, 'ex-2': 180 });
  });

  test('setOverride overwrites existing value for same id', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-1', 90);
    expect(await getOverrides()).toEqual({ 'ex-1': 90 });
  });

  test('clearOverride removes one entry, leaves others', async () => {
    await setOverride('ex-1', 120);
    await setOverride('ex-2', 180);
    await clearOverride('ex-1');
    expect(await getOverrides()).toEqual({ 'ex-2': 180 });
  });

  test('clearOverride on missing entry is no-op', async () => {
    await setOverride('ex-1', 120);
    await clearOverride('ghost');
    expect(await getOverrides()).toEqual({ 'ex-1': 120 });
  });

  test('schema mismatch clears the key on read', async () => {
    store['@flexyug/rest-overrides/v1'] = JSON.stringify({
      schemaVersion: 99,
      overrides: { 'ex-1': 120 },
    });
    expect(await getOverrides()).toEqual({});
  });

  test('malformed JSON returns empty', async () => {
    store['@flexyug/rest-overrides/v1'] = '{not json';
    expect(await getOverrides()).toEqual({});
  });
});

describe('effectiveRest', () => {
  test('returns override if present', () => {
    expect(effectiveRest({ 'ex-1': 120 }, 'ex-1', 'Chest')).toBe(120);
  });

  test('falls back to muscle-group default when no override', () => {
    // Chest = 180 per restDefaults
    expect(effectiveRest({}, 'ex-1', 'Chest')).toBe(180);
  });

  test('falls back when override is for a different exercise', () => {
    expect(effectiveRest({ 'ex-2': 120 }, 'ex-1', 'Chest')).toBe(180);
  });

  test('falls back to 90s for null muscle group', () => {
    expect(effectiveRest({}, 'ex-1', null)).toBe(90);
  });
});
