import { withTransaction } from '@/db/transaction';

/**
 * Fake DB whose withTransactionAsync mimics expo-sqlite: raw BEGIN/COMMIT that
 * is NOT re-entrant. If a second transaction's BEGIN runs while one is already
 * open, it throws — exactly the production failure the mutex must prevent.
 */
function makeFakeDb() {
  let open = false;
  const log: string[] = [];
  return {
    log,
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      if (open) throw new Error('cannot start a transaction within a transaction');
      open = true;
      log.push('BEGIN');
      try {
        await task();
        log.push('COMMIT');
      } finally {
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

  test('a failing transaction releases the lock so the next one still runs', async () => {
    const db = makeFakeDb();

    const failing = withTransaction(db, async () => {
      throw new Error('boom');
    }).catch((e) => (e as Error).message);
    const next = withTransaction(db, async () => {
      db.log.push('next');
    });

    const [failMsg] = await Promise.all([failing, next]);
    expect(failMsg).toBe('boom');
    expect(db.log).toContain('next');
  });

  test('runs synchronously when uncontended (no microtask defer)', () => {
    const db = makeFakeDb();
    void withTransaction(db, async () => {
      db.log.push('immediate');
    });
    // BEGIN + the synchronous part of the task ran before any await.
    expect(db.log).toEqual(['BEGIN', 'immediate']);
  });
});
