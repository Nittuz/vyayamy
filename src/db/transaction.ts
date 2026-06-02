/**
 * App-wide transaction mutex with explicit, fault-tolerant BEGIN/COMMIT/ROLLBACK.
 *
 * `expo-sqlite`'s built-in `withTransactionAsync` is raw `BEGIN / task / COMMIT`
 * with `ROLLBACK` on error, and has two problems:
 *   1. It is NOT concurrency-safe — a transaction can't nest, so two overlapping
 *      transactions collide.
 *   2. On failure its `ROLLBACK` can itself throw ("cannot rollback - no
 *      transaction is active") when the transaction is already closed, and that
 *      throw *replaces* the real error — so you never see why the body failed.
 *
 * The app has several concurrent transaction sources on one SQLite connection
 * (local mutations, sync push, sync pull, quarantine repair). This helper:
 *   - serializes every transaction through one mutex (FIFO; synchronous when
 *     uncontended so call ordering is unchanged), and
 *   - drives BEGIN/COMMIT/ROLLBACK itself, swallowing a failed ROLLBACK so the
 *     original error always propagates.
 *
 * Callers never nest a transaction, so this non-reentrant lock is deadlock-free.
 */

interface Transactable {
  execAsync(sql: string): Promise<void>;
}

let locked = false;
const waiters: Array<() => void> = [];

function release(): void {
  const next = waiters.shift();
  if (next) {
    next(); // hand the lock to the next waiter (stays locked)
  } else {
    locked = false;
  }
}

async function invoke(db: Transactable, task: () => Promise<void>): Promise<void> {
  try {
    await db.execAsync('BEGIN');
    try {
      await task();
      await db.execAsync('COMMIT');
    } catch (err) {
      try {
        await db.execAsync('ROLLBACK');
      } catch {
        // The transaction may already be closed (e.g. SQLite auto-rolled back on
        // a fatal error). Ignore so the original `err` is what propagates.
      }
      throw err;
    }
  } finally {
    release();
  }
}

/** Run `task` inside a serialized SQLite transaction. */
export function withTransaction(db: Transactable, task: () => Promise<void>): Promise<void> {
  if (!locked) {
    locked = true;
    return invoke(db, task);
  }
  return new Promise<void>((resolve, reject) => {
    waiters.push(() => {
      invoke(db, task).then(resolve, reject);
    });
  });
}
