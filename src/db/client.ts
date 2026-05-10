/**
 * SQLite client + schema bootstrap.
 *
 * Uses expo-sqlite's async API. The single database is opened lazily
 * via getDb(); initDb() runs schema migrations once per app launch.
 */
import * as SQLite from 'expo-sqlite';

import { LOCAL_SCHEMA_SQL } from './schema';

const DATABASE_NAME = 'flexyug.db';

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
}

export async function resetDbForTests(): Promise<void> {
  dbPromise = null;
  await SQLite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
}
