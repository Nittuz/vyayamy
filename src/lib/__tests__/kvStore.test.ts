import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllUserScopedKv, getKv, registerUserScopedKv, removeKv, setKv } from '@/lib/kvStore';

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

interface SnapV1 {
  schemaVersion: 1;
  payload: string;
}

test('setKv round-trips through getKv with matching schemaVersion', async () => {
  await setKv<SnapV1>('test:key', { schemaVersion: 1, payload: 'hello' });
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toEqual({ schemaVersion: 1, payload: 'hello' });
});

test('getKv returns null when key is missing', async () => {
  const got = await getKv<SnapV1>('test:missing', 1);
  expect(got).toBeNull();
});

test('getKv returns null and clears the key on schemaVersion mismatch', async () => {
  store['test:key'] = JSON.stringify({ schemaVersion: 0, payload: 'old' });
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toBeNull();
  expect(store['test:key']).toBeUndefined();
});

test('getKv returns null on malformed JSON', async () => {
  store['test:key'] = '{not json';
  const got = await getKv<SnapV1>('test:key', 1);
  expect(got).toBeNull();
});

test('removeKv deletes the key', async () => {
  store['test:key'] = JSON.stringify({ schemaVersion: 1, payload: 'x' });
  await removeKv('test:key');
  expect(store['test:key']).toBeUndefined();
});

describe('user-scoped KV registry (#36)', () => {
  test('clearAllUserScopedKv wipes every registered key and fires onClear', async () => {
    const reset = jest.fn();
    store['@reg/a'] = 'x';
    store['@reg/b'] = 'y';
    registerUserScopedKv('@reg/a');
    registerUserScopedKv('@reg/b', reset);

    await clearAllUserScopedKv();

    expect(store['@reg/a']).toBeUndefined();
    expect(store['@reg/b']).toBeUndefined();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test('registering the same key twice does not double-register', async () => {
    const reset = jest.fn();
    registerUserScopedKv('@reg/dup', reset);
    registerUserScopedKv('@reg/dup', reset);
    await clearAllUserScopedKv();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
