import { withTransaction } from '@/db/transaction';

/**
 * Fake DB mimicking expo-sqlite's connection: a single implicit transaction
 * that cannot nest. A BEGIN while already open throws (like SQLite), and a
 * ROLLBACK with nothing open throws "cannot rollback - no transaction is
 * active" — the exact production failure mode.
 */
function makeFakeDb() {
  let open = false;
  const log: string[] = [];
  return {
    log,
    async execAsync(sql: string): Promise<void> {
      log.push(sql);
      if (sql === 'BEGIN') {
        if (open) throw new Error('cannot start a transaction within a transaction');
        open = true;
      } else if (sql === 'COMMIT') {
        open = false;
      } else if (sql === 'ROLLBACK') {
        if (!open) throw new Error('cannot rollback - no transaction is active');
        open = false;
      }
    },
  };
}

describe('withTransaction mutex', () => {
  test('serializes overlapping transactions instead of interleaving BEGIN/COMMIT', async () => {
    const db = makeFakeDb();

    const first = withTransaction(db, async () => {
      db.log.push('A:work');
      await Promise.resolve();
      db.log.push('A:work2');
    });
    // Started concurrently, before `first` resolves.
    const second = withTransaction(db, async () => {
      db.log.push('B:work');
    });

    await Promise.all([first, second]);

    expect(db.log).toEqual(['BEGIN', 'A:work', 'A:work2', 'COMMIT', 'BEGIN', 'B:work', 'COMMIT']);
  });

  test('propagates the real error from the task (not a rollback error)', async () => {
    const db = makeFakeDb();
    const msg = await withTransaction(db, async () => {
      throw new Error('UNIQUE constraint failed');
    }).catch((e) => (e as Error).message);
    expect(msg).toBe('UNIQUE constraint failed');
    expect(db.log).toEqual(['BEGIN', 'ROLLBACK']);
  });

  test('a failed transaction releases the lock so the next one still runs', async () => {
    const db = makeFakeDb();
    const failing = withTransaction(db, async () => {
      throw new Error('boom');
    }).catch(() => {});
    const next = withTransaction(db, async () => {
      db.log.push('next');
    });
    await Promise.all([failing, next]);
    expect(db.log).toContain('next');
  });
});
