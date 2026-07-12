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
export const SCHEMA_VERSION = 4;

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

  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = v?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    // Downgrade detected — keep going (data is forward-compatible) but flag it.
    // eslint-disable-next-line no-console
    console.warn(
      `[flexyug] SQLite user_version=${current} > app SCHEMA_VERSION=${SCHEMA_VERSION}; running on stale build`,
    );
  }

  // Lightweight in-place migrations, GATED on user_version (#57): an install
  // already at SCHEMA_VERSION skips them entirely, so every launch doesn't
  // replay ALTERs/backfills whose only defense was being idempotent. The
  // version is stamped only AFTER the block completes — a crash mid-migration
  // leaves the version low and the block re-runs next launch.
  if (current < SCHEMA_VERSION) {
    // v2: outbox backoff scheduling column.
    await tryAlter(db, 'ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT');

    // v4 — per-set units (#131). Existing installs need the column added;
    // weight-bearing rows logged before this column existed are backfilled with
    // the owner's current display unit — the unit the number was entered and
    // shown in — so no historical weight is silently reinterpreted. Empty
    // staged sets (no weight) stay null and get their unit when a weight is
    // first written. The backfill is naturally idempotent: after the first run
    // no weight-bearing row has a null unit, so a re-run is a no-op.
    await tryAlter(db, 'ALTER TABLE sets ADD COLUMN units TEXT');
    const prof = await db
      .getFirstAsync<{
        units: string;
      }>('SELECT units FROM profiles WHERE deleted_at IS NULL LIMIT 1')
      .catch(() => null);
    await db.runAsync('UPDATE sets SET units = ? WHERE units IS NULL AND weight IS NOT NULL', [
      prof?.units ?? 'kg',
    ]);

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

/** Run an idempotent ALTER. expo-sqlite (unlike Postgres) has no IF NOT EXISTS
 *  for ALTER TABLE, so a re-run legitimately fails with "duplicate column
 *  name" — ONLY that error is swallowed. Anything else (locked db, corrupt
 *  table, typo'd SQL) is a real migration failure: it is reported through the
 *  gated error-reporting path instead of vanishing silently (#57), but does
 *  not throw — bricking startup over a single failed ALTER would be worse
 *  than running with the column missing. Exported for tests. */
export async function tryAlter(db: SQLite.SQLiteDatabase, sql: string): Promise<void> {
  try {
    await db.execAsync(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate column name/i.test(msg)) return;
    // Lazy import: errorReporting pulls in expo-constants, which must not sit
    // in the module graph of every db/client consumer — only a genuinely
    // failing migration pays for loading it.
    const { captureException } = await import('@/lib/errorReporting');
    captureException(err, { migration_sql: sql });
  }
}
