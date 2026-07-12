import {
  REST_TIMER_KEY,
  REST_TIMER_SCHEMA_VERSION,
  shouldRestoreTimer,
  type PersistedTimer,
} from '@/rest/timerPolicy';

// The storage key and schema version are a persisted contract with users'
// devices. Moving the module (e.g. #41's src/rest consolidation) must NEVER
// change them, or an in-flight rest timer would be dropped on upgrade.
test('storage key string and schema version are frozen', () => {
  expect(REST_TIMER_KEY).toBe('@flexyug/rest-timer/v1');
  expect(REST_TIMER_SCHEMA_VERSION).toBe(1);
});

test('null persisted → do not restore, no clear', () => {
  expect(shouldRestoreTimer(null, Date.now())).toEqual({
    restore: false,
    clearStale: false,
  });
});

test('schema mismatch → do not restore, clear stale', () => {
  const persisted = {
    schemaVersion: 99,
    startedAt: Date.now() - 30_000,
    targetSeconds: 90,
  } as unknown as PersistedTimer;
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('negative elapsed (clock skew) → do not restore, clear stale', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() + 5_000,
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('elapsed > 2 × target → do not restore, clear stale', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() - 200 * 1000, // 200s
    targetSeconds: 90, // 2 × 90 = 180s threshold
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: false,
    clearStale: true,
  });
});

test('elapsed within threshold → restore', () => {
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: Date.now() - 30_000, // 30s
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, Date.now())).toEqual({
    restore: true,
    clearStale: false,
  });
});

test('elapsed just under 2 × target → still restore', () => {
  const now = Date.now();
  const persisted: PersistedTimer = {
    schemaVersion: 1,
    startedAt: now - 179 * 1000, // 179s, just under 2*90
    targetSeconds: 90,
  };
  expect(shouldRestoreTimer(persisted, now)).toEqual({
    restore: true,
    clearStale: false,
  });
});
