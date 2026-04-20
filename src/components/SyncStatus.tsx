import { useEffect, useState } from 'react';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import type { SyncState } from '../lib/domain';
import { deriveSyncState, syncStateLabel } from '../lib/syncHelpers';
import './SyncStatus.css';

export type { SyncState };

type SyncStatusProps = {
  isPending: boolean;
  isError: boolean;
};

export function SyncStatus({ isPending, isError }: SyncStatusProps) {
  const online = useOnlineStatus();
  const [showSaved, setShowSaved] = useState(false);
  const [wasPending, setWasPending] = useState(false);

  useEffect(() => {
    if (isPending) {
      setWasPending(true);
      setShowSaved(false);
    } else if (wasPending && !isError) {
      setShowSaved(true);
      setWasPending(false);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isPending, isError, wasPending]);

  const state: SyncState = deriveSyncState(online, isPending, isError, showSaved);

  if (state === 'idle') return null;

  return (
    <span
      className={`sync-status sync-status--${state}`}
      role="status"
      aria-live="polite"
    >
      <span className="sync-status-dot" />
      {syncStateLabel(state)}
    </span>
  );
}
