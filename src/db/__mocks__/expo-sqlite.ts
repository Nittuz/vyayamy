/**
 * expo-sqlite Jest mock backed by better-sqlite3.
 *
 * Implements the subset of the expo-sqlite async API that the app actually
 * uses. Two design choices that matter for test fidelity:
 *
 *   - Each method body is preceded by an `await Promise.resolve()` to
 *     introduce a microtask tick. better-sqlite3 is synchronous, but the
 *     real expo-sqlite is async — without a tick, two concurrent
 *     enqueueMutation calls would interleave at the byte level and hide
 *     races that show up in production. Forcing a yield exposes them.
 *   - withTransactionAsync uses SAVEPOINTs with a depth counter so it can
 *     be nested, mirroring the real expo-sqlite which permits nesting via
 *     SAVEPOINT under the hood. Without this, future code that nests would
 *     break only at runtime.
 */
import BetterSqlite3 from 'better-sqlite3';

type Param = string | number | null;

class MockDb {
  private db: BetterSqlite3.Database;
  private txDepth = 0;
  constructor() {
    this.db = new BetterSqlite3(':memory:');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async execAsync(sql: string): Promise<void> {
    await Promise.resolve();
    this.db.exec(sql);
  }

  async runAsync(
    sql: string,
    params: Param[] | Param = [],
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    await Promise.resolve();
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(args as unknown[]));
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, params: Param[] | Param = []): Promise<T | null> {
    await Promise.resolve();
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    return (stmt.get(...(args as unknown[])) as T) ?? null;
  }

  async getAllAsync<T>(sql: string, params: Param[] | Param = []): Promise<T[]> {
    await Promise.resolve();
    const args = Array.isArray(params) ? params : [params];
    const stmt = this.db.prepare(sql);
    return stmt.all(...(args as unknown[])) as T[];
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    await Promise.resolve();
    const depth = this.txDepth++;
    if (depth === 0) {
      this.db.exec('BEGIN');
    } else {
      this.db.exec(`SAVEPOINT sp_${depth}`);
    }
    try {
      await fn();
      if (depth === 0) {
        this.db.exec('COMMIT');
      } else {
        this.db.exec(`RELEASE sp_${depth}`);
      }
    } catch (err) {
      if (depth === 0) {
        this.db.exec('ROLLBACK');
      } else {
        this.db.exec(`ROLLBACK TO sp_${depth}`);
        this.db.exec(`RELEASE sp_${depth}`);
      }
      throw err;
    } finally {
      this.txDepth--;
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
