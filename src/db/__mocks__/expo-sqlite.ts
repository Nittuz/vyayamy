/**
 * expo-sqlite Jest mock backed by better-sqlite3.
 *
 * Implements the subset of the expo-sqlite async API that the app
 * actually uses: openDatabaseAsync, deleteDatabaseAsync, execAsync,
 * runAsync, getFirstAsync, getAllAsync, withTransactionAsync.
 *
 * Each database name gets its own in-memory better-sqlite3 instance so
 * tests stay isolated.
 */
import BetterSqlite3 from 'better-sqlite3';

type Param = string | number | null;

class MockDb {
  private db: BetterSqlite3.Database;
  constructor() {
    this.db = new BetterSqlite3(':memory:');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: Param[] | Param = []): Promise<{ changes: number; lastInsertRowId: number }> {
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(args as unknown[]));
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, params: Param[] | Param = []): Promise<T | null> {
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    return (stmt.get(...(args as unknown[])) as T) ?? null;
  }

  async getAllAsync<T>(sql: string, params: Param[] | Param = []): Promise<T[]> {
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    return stmt.all(...(args as unknown[])) as T[];
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

const instances = new Map<string, MockDb>();

export async function openDatabaseAsync(name: string): Promise<MockDb> {
  let db = instances.get(name);
  if (!db) {
    db = new MockDb();
    instances.set(name, db);
  }
  return db;
}

export async function deleteDatabaseAsync(name: string): Promise<void> {
  const db = instances.get(name);
  if (db) await db.closeAsync();
  instances.delete(name);
}

export type SQLiteDatabase = MockDb;
