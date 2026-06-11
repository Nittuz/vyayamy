/**
 * Local mutation event bus (#34).
 *
 * enqueueMutation (and the few direct-write hot paths) emit here after a write
 * commits; the sync engine subscribes and debounces a push. This replaces the
 * 13 hand-placed `void triggerPush()` calls and breaks the queries → sync import
 * coupling — the queries layer no longer knows the sync engine exists.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to local mutation commits. Returns an unsubscribe function. */
export function onMutationCommitted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notify subscribers that a local mutation committed. Best-effort per listener. */
export function emitMutationCommitted(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // a misbehaving subscriber must not break the write path
    }
  }
}
