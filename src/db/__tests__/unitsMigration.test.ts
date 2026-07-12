/**
 * Regression guard for deep-review #131 (per-set units model):
 *   existing sets logged before the `units` column existed must be backfilled
 *   with the owner's current display unit — the unit the number was actually
 *   entered/shown in — so no historical weight is silently reinterpreted.
 *
 * Simulates the pre-migration shape (a sets table without `units`) and asserts
 * initDb adds the column and stamps weight-bearing rows with the profile unit.
 */
import * as SQLite from 'expo-sqlite';

import { getDb, initDb, resetDbForTests } from '@/db/client';

jest.mock('@/auth/supabase', () => ({ supabase: { from: () => ({}) } }));

beforeEach(async () => {
  await resetDbForTests();
});

async function makePreMigrationDb(units: 'kg' | 'lb'): Promise<void> {
  const db = await SQLite.openDatabaseAsync('flexyug.db');
  // Old-shape tables (no `units` column on sets), enough to exercise backfill.
  await db.execAsync(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, units TEXT NOT NULL DEFAULT 'kg', updated_at TEXT, deleted_at TEXT);
    CREATE TABLE sets (
      id TEXT PRIMARY KEY, workout_exercise_id TEXT, order_index INTEGER,
      weight REAL, reps INTEGER, completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
  `);
  await db.runAsync(`INSERT INTO profiles (id, units, updated_at) VALUES ('p1', ?, '2026-01-01')`, [
    units,
  ]);
  // A weight-bearing historical set + an empty staged set.
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, updated_at)
       VALUES ('s-weighted', 'we1', 0, 100, 5, 1, '2026-01-01')`,
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, order_index, weight, reps, completed, updated_at)
       VALUES ('s-empty', 'we1', 1, NULL, NULL, 0, '2026-01-01')`,
  );
}

test('migration backfills historical set units from the profile (lb user)', async () => {
  await makePreMigrationDb('lb');
  await initDb();

  const db = await getDb();
  const weighted = await db.getFirstAsync<{ units: string | null }>(
    `SELECT units FROM sets WHERE id = 's-weighted'`,
  );
  // The 100 was entered and displayed as lb — it must stay lb, not become kg.
  expect(weighted?.units).toBe('lb');

  // Empty staged sets carry no weight yet, so they get no spurious unit.
  const empty = await db.getFirstAsync<{ units: string | null }>(
    `SELECT units FROM sets WHERE id = 's-empty'`,
  );
  expect(empty?.units).toBeNull();
});

test('migration is idempotent — a second initDb does not change units', async () => {
  await makePreMigrationDb('kg');
  await initDb();
  await initDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ units: string | null }>(
    `SELECT units FROM sets WHERE id = 's-weighted'`,
  );
  expect(row?.units).toBe('kg');
});
