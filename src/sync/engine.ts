/**
 * Sync engine scaffold.
 *
 * The real push/pull implementations live in src/sync/push.ts and
 * src/sync/pull.ts (Phase 2). This module owns the lifecycle:
 *
 *   - subscribe to network and auth state
 *   - run push after every local mutation (via triggerPush)
 *   - run pull on foreground and connectivity regain
 *   - throttle / coalesce concurrent runs
 */
import type { QueryClient } from '@tanstack/react-query';
import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';

import { supabase } from '@/auth/supabase';
import { syncInvalidationRoots } from '@/queries/keys';

import { pullOnce } from './pull';
import { pushOutbox } from './push';
import { getSyncState, setSyncState } from './state';

let netSub: NetInfoSubscription | null = null;
let authSub: { unsubscribe: () => void } | null = null;
let client: QueryClient | null = null;
let pushInFlight = false;
let pullInFlight = false;

export function startSyncEngine(queryClient: QueryClient) {
  client = queryClient;
  netSub = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    setSyncState({ online });
    if (online) {
      void runSyncCycle();
    }
  });
  // Auth-change trigger: initial pulls fired before sign-in run unauthenticated
  // and 401. SIGNED_IN re-runs the cycle once a session exists so the user's
  // first authenticated load is not blank.
  authSub = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void runSyncCycle();
    }
  }).data.subscription;
}

export function stopSyncEngine() {
  netSub?.();
  netSub = null;
  authSub?.unsubscribe();
  authSub = null;
  client = null;
}

function invalidateAfterSync(): void {
  if (!client) return;
  for (const prefix of syncInvalidationRoots) {
    void client.invalidateQueries({ queryKey: [...prefix] });
  }
}

export async function triggerPush(): Promise<void> {
  if (!getSyncState().online) return;
  if (pushInFlight) return;
  pushInFlight = true;
  try {
    await pushOutbox();
    setSyncState({ lastError: null });
    invalidateAfterSync();
  } catch (err) {
    setSyncState({ lastError: errorMessage(err) });
  } finally {
    pushInFlight = false;
  }
}

export async function triggerPull(): Promise<void> {
  if (!getSyncState().online) return;
  if (pullInFlight) return;
  pullInFlight = true;
  try {
    await pullOnce();
    setSyncState({ lastError: null });
    invalidateAfterSync();
  } catch (err) {
    setSyncState({ lastError: errorMessage(err) });
  } finally {
    pullInFlight = false;
  }
}

export async function runSyncCycle(): Promise<void> {
  await triggerPush();
  await triggerPull();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
