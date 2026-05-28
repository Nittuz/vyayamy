import { useEffect, useState } from 'react';

import { getSyncState, subscribeSync, type SyncState } from './state';

/**
 * React hook that subscribes to sync state changes and returns the
 * current snapshot. Components re-render automatically when state
 * pub/sub fires.
 */
export function useSyncStateLive(): SyncState {
  const [snapshot, setSnapshot] = useState<SyncState>(() => getSyncState());
  useEffect(() => {
    const unsub = subscribeSync(setSnapshot);
    // Sync once immediately in case state changed between mount and subscribe
    setSnapshot(getSyncState());
    return unsub;
  }, []);
  return snapshot;
}
