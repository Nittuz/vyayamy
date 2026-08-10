/**
 * Regression guard for deep-review #57 (schema migration hygiene):
 *
 *   (a) tryAlter swallowed EVERY error — a genuine migration failure (locked
 *       db, corrupt table, typo'd SQL) vanished silently and the app ran on a
 *       half-migrated schema. It must swallow ONLY the expected
 *       "duplicate column name" (idempotent re-run) and report anything else
 *       through the gated error-reporting path.
 *   (b) PRAGMA user_version was stamped but gated nothing. The migration
 *       block must be skipped when user_version == SCHEMA_VERSION, run when
 *       lower, and stamp the version only after the migrations completed.
 */
import { captureException } from '@/lib/errorReporting';

import { SCHEMA_VERSION, getDb, initDb, resetDbForTests, tryAlter } from '../client';

jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));
jest.mock('@/lib/errorReporting', () => ({ captureException: jest.fn() }));

const mockCapture = captureException as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDbForTests();
});

async function userVersion(): Promise<number> {
  const db = await getDb();
  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return v?.user_version ?? -1;
}

async function setsHasUnitsColumn(): Promise<boolean> {
  const db = await getDb();
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
  return cols.some((c) => c.name === 'units');
}

describe('tryAlter (#57a)', () => {
  test('duplicate-column failure stays silent (idempotent re-run is expected)', async () => {
    await initDb();
    const db = await getDb();
    await expect(tryAlter(db, 'ALTER TABLE sets ADD COLUMN units TEXT')).resolves.toBeUndefined();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('any OTHER failure is reported, not swallowed silently', async () => {
    await initDb();
    const db = await getDb();
    await expect(
      tryAlter(db, 'ALTER TABLE no_such_table ADD COLUMN x TEXT'),
    ).resolves.toBeUndefined(); // must not brick startup...
    expect(mockCapture).toHaveBeenCalledTimes(1); // ...but must be visible
  });

  test('a clean initDb on a fresh database reports nothing', async () => {
    await initDb();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('user_version gating (#57b)', () => {
  test('fresh database: migrations run and SCHEMA_VERSION is stamped after', async () => {
    await initDb();
    expect(await userVersion()).toBe(SCHEMA_VERSION);
    expect(await setsHasUnitsColumn()).toBe(true);
  });

  test('user_version == SCHEMA_VERSION: the migration block is SKIPPED', async () => {
    await initDb(); // stamps SCHEMA_VERSION
    const db = await getDb();
    // Perturb migration-managed state; if the block re-ran it would restore it.
    await db.execAsync('DROP INDEX IF EXISTS idx_sets_completed_at');
    await db.execAsync('ALTER TABLE sets DROP COLUMN units');

    await initDb();

    expect(await setsHasUnitsColumn()).toBe(false); // untouched → block skipped
    expect(await userVersion()).toBe(SCHEMA_VERSION);
  });

  test('user_version < SCHEMA_VERSION: migrations run and re-stamp', async () => {
    await initDb();
    const db = await getDb();
    await db.execAsync('DROP INDEX IF EXISTS idx_sets_completed_at');
    await db.execAsync('ALTER TABLE sets DROP COLUMN units');
    await db.execAsync('PRAGMA user_version = 0');

    await initDb();

    expect(await setsHasUnitsColumn()).toBe(true); // migration re-applied
    expect(await userVersion()).toBe(SCHEMA_VERSION);
  });

  test('v5 migration adds the note columns to a v4 database', async () => {
    await initDb();
    const db = await getDb();
    // Model a v4 install: note columns absent, version below current.
    await db.execAsync('ALTER TABLE workouts DROP COLUMN note');
    await db.execAsync('ALTER TABLE workout_exercises DROP COLUMN note');
    await db.execAsync('PRAGMA user_version = 4');

    await initDb();

    const wCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
    const weCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workout_exercises)');
    expect(wCols.some((c) => c.name === 'note')).toBe(true);
    expect(weCols.some((c) => c.name === 'note')).toBe(true);
    expect(await userVersion()).toBe(SCHEMA_VERSION);
  });

  test('v5 migration rewinds the pull cursor for the altered tables only', async () => {
    await initDb();
    const db = await getDb();
    // A v4 device pulled rows WITHOUT the note column and advanced its cursor;
    // without a rewind, notes written in that window would never arrive.
    for (const t of ['workouts', 'workout_exercises', 'sets']) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_meta (table_name, last_pulled_at, last_pulled_id) VALUES (?, ?, ?)`,
        [t, '2026-08-01T00:00:00.000Z', 'row-1'],
      );
    }
    await db.execAsync('PRAGMA user_version = 4');

    await initDb();

    const rows = await db.getAllAsync<{
      table_name: string;
      last_pulled_at: string | null;
    }>('SELECT table_name, last_pulled_at FROM sync_meta ORDER BY table_name');
    const byTable = Object.fromEntries(rows.map((r) => [r.table_name, r.last_pulled_at]));
    expect(byTable['workouts']).toBeNull(); // rewound → pull restarts from epoch
    expect(byTable['workout_exercises']).toBeNull();
    expect(byTable['sets']).toBe('2026-08-01T00:00:00.000Z'); // untouched
  });
});
