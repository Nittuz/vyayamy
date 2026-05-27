import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSnapshot,
  getCachedSnapshot,
  hydrateSnapshot,
  persistSnapshot,
  TodaySnapshot,
  __resetCacheForTests,
} from '@/ui/todaySnapshot';

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  __resetCacheForTests();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) => store[k] ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
    store[k] = v;
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (k: string) => {
    delete store[k];
  });
});

const sample: TodaySnapshot = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  state: 'repeat',
  repeatTitle: 'Push',
  repeatDaysAgo: 2,
  repeatSeeds: [
    { exerciseId: 'ex-1', exerciseName: 'Bench', seedWeight: 185, seedReps: 5 },
  ],
  recentRows: [{ id: 'w-1', title: 'Pull', daysAgo: 4 }],
};

test('getCachedSnapshot returns null before hydrate', () => {
  expect(getCachedSnapshot()).toBeNull();
});

test('hydrateSnapshot loads a previously-persisted value into the cache', async () => {
  store['@flexyug/today-snapshot/v1'] = JSON.stringify(sample);
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toEqual(sample);
});

test('persistSnapshot writes and updates the cache', async () => {
  await persistSnapshot(sample);
  expect(getCachedSnapshot()).toEqual(sample);
  expect(JSON.parse(store['@flexyug/today-snapshot/v1']!)).toEqual(sample);
});

test('clearSnapshot clears AsyncStorage and the cache', async () => {
  await persistSnapshot(sample);
  await clearSnapshot();
  expect(getCachedSnapshot()).toBeNull();
  expect(store['@flexyug/today-snapshot/v1']).toBeUndefined();
});

test('hydrateSnapshot discards snapshots older than 7 days', async () => {
  const stale: TodaySnapshot = {
    ...sample,
    capturedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  };
  store['@flexyug/today-snapshot/v1'] = JSON.stringify(stale);
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toBeNull();
});

test('hydrateSnapshot ignores corrupt JSON', async () => {
  store['@flexyug/today-snapshot/v1'] = '{not json';
  await hydrateSnapshot();
  expect(getCachedSnapshot()).toBeNull();
});
