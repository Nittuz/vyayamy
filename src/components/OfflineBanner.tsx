// TODO(beta-follow-up): The "will sync" copy implies an offline queue that doesn't exist yet.
// Until IndexedDB persistence is added, mutations will fail offline. Consider changing copy
// to "You're offline. Some features may not work." or implementing a service worker outbox.
import { useOnlineStatus } from '../lib/useOnlineStatus';
import './OfflineBanner.css';

export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="assertive">
      <span className="offline-banner-dot" />
      You're offline. Changes will sync when you reconnect.
    </div>
  );
}
