/**
 * SQLite client + schema bootstrap.
 *
 * Uses expo-sqlite's async API. The single database is opened lazily
 * via getDb(); initDb() runs the bootstrap schema (CREATE TABLE IF NOT
 * EXISTS) plus a small set of idempotent ALTERs so existing installs
 * pick up new columns without losing local data.
 *
 * SCHEMA_VERSION is recorded via PRAGMA user_version. If a future build
 * downgrades and reads a higher version, initDb logs a warning so the
 * issue is visible in dev and Sentry rather than silently corrupting.
 */
import * as SQLite from 'expo-sqlite';

import { LOCAL_SCHEMA_SQL } from './schema';

const DATABASE_NAME = 'flexyug.db';

/** Bump when LOCAL_SCHEMA_SQL adds columns or tables that need a migration step. */
const SCHEMA_VERSION = 4;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(LOCAL_SCHEMA_SQL);

  // Lightweight in-place migrations. Each is wrapped in try/catch because
  // expo-sqlite (unlike Postgres) has no IF NOT EXISTS for ALTER TABLE.
  await tryAlter(db, 'ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT');

  // Per-set units (#131). Existing installs need the column added; weight-
  // bearing rows logged before this column existed are backfilled with the
  // owner's current display unit — the unit the number was entered and shown
  // in — so no historical weight is silently reinterpreted. Empty staged sets
  // (no weight) stay null and get their unit when a weight is first written.
  // The backfill is naturally idempotent: after the first run no weight-bearing
  // row has a null unit, so subsequent runs are a no-op.
  await tryAlter(db, 'ALTER TABLE sets ADD COLUMN units TEXT');
  const prof = await db
    .getFirstAsync<{ units: string }>('SELECT units FROM profiles WHERE deleted_at IS NULL LIMIT 1')
    .catch(() => null);
  await db.runAsync('UPDATE sets SET units = ? WHERE units IS NULL AND weight IS NOT NULL', [
    prof?.units ?? 'kg',
  ]);

  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = v?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    // Downgrade detected — keep going (data is forward-compatible) but flag it.
    // eslint-disable-next-line no-console
    console.warn(
      `[flexyug] SQLite user_version=${current} > app SCHEMA_VERSION=${SCHEMA_VERSION}; running on stale build`,
    );
  }
  if (current < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

export async function resetDbForTests(): Promise<void> {
  dbPromise = null;
  await SQLite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
}

/** Wipe the user's local database. Used on sign-out so a different user cannot
 *  see (or accidentally re-push) the previous user's data. Safe to call from
 *  app code; subsequent getDb() will reopen with a fresh file. */
export async function resetLocalDb(): Promise<void> {
  // Best-effort close; expo-sqlite holds an open handle.
  try {
    if (dbPromise) {
      const db = await dbPromise;
      const closeable = db as unknown as { closeAsync?: () => Promise<void> };
      if (typeof closeable.closeAsync === 'function') await closeable.closeAsync();
    }
  } catch {
    // Ignore — we're about to delete the file regardless.
  }
  dbPromise = null;
  let deleted = true;
  try {
    await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  } catch {
    // The OS may refuse to delete a file whose handle is still held. Don't
    // swallow it silently — fall back to an explicit table wipe below so the
    // previous user's data can never survive a sign-out (#1).
    deleted = false;
  }
  // Recreate the schema immediately. initDb() only runs once at app startup, so
  // without this a sign-out (which deletes the file) followed by a sign-in in the
  // same session would leave an empty database — every query then throws
  // "no such table". Re-bootstrapping here keeps the next sign-in fully usable.
  await initDb();
  if (!deleted) {
    await wipeAllTables();
  }
}

/** Defensive wipe of every table — used only when file deletion failed, so a
 *  reopened (still-populated) database cannot leak data across accounts. */
async function wipeAllTables(): Promise<void> {
  const db = await getDb();
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  for (const { name } of tables) {
    await db.runAsync(`DELETE FROM ${name}`);
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

async function tryAlter(db: SQLite.SQLiteDatabase, sql: string): Promise<void> {
  try {
    await db.execAsync(sql);
  } catch {
    // Column already exists or table missing — both safe to ignore here.
  }
}
