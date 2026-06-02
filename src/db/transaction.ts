/**
 * App-wide transaction mutex.
 *
 * `expo-sqlite`'s `withTransactionAsync` is raw `BEGIN / task / COMMIT` (ROLLBACK
 * on error) and is NOT concurrency-safe — a transaction can't nest, so two
 * overlapping `withTransactionAsync` calls collide and throw
 * "cannot rollback - no transaction is active", masking the real error.
 *
 * The app has several concurrent transaction sources on one SQLite connection:
 * local user mutations (`enqueueMutation`), the sync push, the sync pull, and
 * quarantine repair. They can fire at the same time (e.g. logging a set while a
 * background pull runs). This mutex serializes every transaction through one
 * lock so their `BEGIN/COMMIT` never interleave.
 *
 * - Invokes synchronously when uncontended (no microtask defer) so call
 *   ordering and in-flight bookkeeping are unchanged.
 * - FIFO-queues under contention.
 * - The current callers never nest a transaction inside another, so this
 *   non-reentrant lock is deadlock-free. (If nesting is ever introduced, switch
 *   to a reentrant strategy or `withExclusiveTransactionAsync`.)
 */

interface Transactable {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
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

function invoke(db: Transactable, task: () => Promise<void>): Promise<void> {
  let result: Promise<void>;
  try {
    result = db.withTransactionAsync(task);
  } catch (err) {
    release();
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
  return result.then(
    () => {
      release();
    },
    (err) => {
      release();
      throw err;
    },
  );
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
