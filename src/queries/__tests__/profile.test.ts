import { getDb, initDb, resetDbForTests } from '@/db/client';
import { getProfile, updateProfile } from '@/queries/profile';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER = 'profile-user';
const T = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false });
});

async function seedProfile(deleted = false) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO profiles (id, display_name, units, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
    [USER, 'Old Name', 'kg', T, T, deleted ? T : null],
  );
}

test('getProfile returns the row for an existing user', async () => {
  await seedProfile();
  const profile = await getProfile(USER);
  expect(profile!.id).toBe(USER);
  expect(profile!.display_name).toBe('Old Name');
  expect(profile!.units).toBe('kg');
});

test('getProfile returns null for an unknown user', async () => {
  expect(await getProfile('nobody')).toBeNull();
});

test('getProfile ignores soft-deleted profiles', async () => {
  await seedProfile(true);
  expect(await getProfile(USER)).toBeNull();
});

test('updateProfile upserts a new profile via the outbox and locally', async () => {
  await updateProfile(USER, { display_name: 'Naren', units: 'lb' });

  const profile = await getProfile(USER);
  expect(profile!.display_name).toBe('Naren');
  expect(profile!.units).toBe('lb');

  const db = await getDb();
  const outbox = await db.getAllAsync<{ op: string; table_name: string; payload_json: string }>(
    'SELECT op, table_name, payload_json FROM outbox WHERE row_id = ?',
    [USER],
  );
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.op).toBe('upsert');
  expect(outbox[0]!.table_name).toBe('profiles');
  expect(JSON.parse(outbox[0]!.payload_json)).toMatchObject({ id: USER, display_name: 'Naren', units: 'lb' });
});

test('updateProfile patches an existing profile, leaving untouched fields intact', async () => {
  await seedProfile();
  await updateProfile(USER, { units: 'lb' });

  const profile = await getProfile(USER);
  expect(profile!.units).toBe('lb');
  expect(profile!.display_name).toBe('Old Name');
});
