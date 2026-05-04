/**
 * SQLite client + schema bootstrap.
 *
 * Uses expo-sqlite's async API. The single database is opened lazily
 * via getDb(); initDb() runs schema migrations once per app launch.
 */
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { LOCAL_SCHEMA_SQL } from './schema';

const DATABASE_NAME = 'vyayamy.db';

/** expo-sqlite has no native implementation on web; the JS stub breaks `new NativeDatabase()`. */
export const SQLITE_UNAVAILABLE_WEB =
  'Vyayamy needs on-device SQLite, which Expo does not provide in the web preview. Use the iOS Simulator, Android emulator, Expo Go on a phone, or a development build (npx expo run:ios / run:android).';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    return Promise.reject(new Error(SQLITE_UNAVAILABLE_WEB));
  }
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
