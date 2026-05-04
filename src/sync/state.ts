/**
 * Process-wide sync state. Lightweight pub/sub — no React dependency
 * so it can be read from mutation code paths that run outside hooks.
 */
export interface SyncState {
  online: boolean;
  pushInFlight: boolean;
  pullInFlight: boolean;
  pendingOutbox: number;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  lastError: string | null;
}

type Listener = (s: SyncState) => void;

let state: SyncState = {
  online: true,
  pushInFlight: false,
  pullInFlight: false,
  pendingOutbox: 0,
  lastPushedAt: null,
  lastPulledAt: null,
  lastError: null,
};

const listeners = new Set<Listener>();

export function getSyncState(): SyncState {
  return state;
}

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}
