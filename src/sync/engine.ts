/**
 * Sync engine lifecycle.
 *
 * Owns:
 *   - subscription to network and auth state
 *   - throttled push (after every local mutation, via triggerPush)
 *   - throttled pull (on connectivity regain, app foreground, sign-in)
 *   - React Query invalidation after pull/push so screens refresh
 *   - sign-out cleanup: stop subscriptions, clear React Query, drop SQLite
 *
 * The push/pull primitives themselves live in src/sync/push.ts and
 * src/sync/pull.ts.
 */
import type { QueryClient } from '@tanstack/react-query';
import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, type NativeEventSubscription } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { supabase } from '@/auth/supabase';
import { resetLocalDb } from '@/db/client';
import { removeKv } from '@/lib/kvStore';
import { syncInvalidationRoots } from '@/queries/keys';
import { clearSnapshot } from '@/ui/todaySnapshot';
import { REST_TIMER_KEY } from '@/ui/hooks/restTimerPolicy';
import { REST_OVERRIDES_KEY } from '@/ui/restOverrides';

import { pullOnce } from './pull';
import { __setRetryScheduler, pushOutbox } from './push';
import { getSyncState, setSyncState } from './state';

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wrap a listener callback so a thrown exception doesn't propagate
 * to React Native's global error handler.
 */
function safeListener<T extends unknown[]>(
  label: string,
  fn: (...args: T) => void | Promise<void>,
): (...args: T) => void {
  return (...args: T) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        result.catch((err) => {
          Sentry.captureException(err, { tags: { engine_listener: label } });
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { engine_listener: label } });
    }
  };
}

let netSub: NetInfoSubscription | null = null;
let authSub: { unsubscribe: () => void } | null = null;
let appStateSub: NativeEventSubscription | null = null;
let client: QueryClient | null = null;
let pushInFlight = false;
let pullInFlight = false;
// The actual in-flight cycle promises, so sign-out can await them before wiping
// the database (a push/pull that resolves after the wipe would otherwise write
// to — or recreate rows in — the fresh database, #1).
let currentPush: Promise<void> | null = null;
let currentPull: Promise<void> | null = null;

export function startSyncEngine(queryClient: QueryClient) {
  client = queryClient;

  // Let push schedule a single follow-up drain for the earliest backed-off row,
  // so a transient failure recovers without waiting for the next user action (#5).
  __setRetryScheduler((delayMs) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (getSyncState().online) void triggerPush();
    }, delayMs);
  });
  netSub = NetInfo.addEventListener(safeListener('network', (state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    setSyncState({ online });
    if (online) {
      void runSyncCycle();
    }
  }));

  // Foreground re-pull. Without this, opening the app after hours on stable
  // wifi (no NetInfo change) would leave the user staring at stale data.
  appStateSub = AppState.addEventListener('change', safeListener('appState', (nextState) => {
    if (nextState === 'active' && getSyncState().online) {
      void runSyncCycle();
    }
  }));

  // Auth-change trigger. Initial pulls fired before sign-in run unauthenticated
  // and 401. SIGNED_IN re-runs the cycle once a session exists. SIGNED_OUT
  // wipes the local database so a different user signing in afterwards never
  // sees the previous user's workouts and never re-pushes their pending
  // mutations under a new identity.
  authSub = supabase.auth.onAuthStateChange(safeListener('auth', (event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void runSyncCycle();
    } else if (event === 'SIGNED_OUT') {
      void handleSignOut();
    }
  })).data.subscription;
}

export function stopSyncEngine() {
  __setRetryScheduler(null);
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  netSub?.();
  netSub = null;
  authSub?.unsubscribe();
  authSub = null;
  appStateSub?.remove();
  appStateSub = null;
  client = null;
}

export async function handleSignOut(): Promise<void> {
  // Wait for any in-flight push/pull to settle FIRST, so a cycle that resolves
  // mid-wipe can't write to (or recreate rows in) the fresh database (#1).
  await Promise.allSettled(
    [currentPush, currentPull].filter((p): p is Promise<void> => p != null),
  );
  // Then drop React Query caches so screens don't render the previous user's
  // data, and delete the on-device SQLite file so a follow-up sign-in starts clean.
  pushInFlight = false;
  pullInFlight = false;
  currentPush = null;
  currentPull = null;
  setSyncState({
    pushInFlight: false,
    pullInFlight: false,
    pendingOutbox: 0,
    quarantinedOutbox: 0,
    lastError: null,
    lastErrorAt: null,
    lastPushedAt: null,
    lastPulledAt: null,
  });
  // Clear Phase 2 KV state so a follow-up sign-in doesn't see the previous
  // user's Today snapshot or active rest timer.
  await Promise.all([
    clearSnapshot(),
    removeKv(REST_TIMER_KEY),
    removeKv(REST_OVERRIDES_KEY),
  ]);
  client?.clear();
  await resetLocalDb();
}

function invalidateAfterSync(): void {
  if (!client) return;
  for (const prefix of syncInvalidationRoots) {
    void client.invalidateQueries({ queryKey: [...prefix] });
  }
}

export function triggerPush(): Promise<void> {
  if (!getSyncState().online) return Promise.resolve();
  if (pushInFlight) return currentPush ?? Promise.resolve();
  pushInFlight = true;
  const run = (async () => {
    try {
      await pushOutbox();
      setSyncState({ lastError: null, lastErrorAt: null });
      invalidateAfterSync();
    } catch (err) {
      setSyncState({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString() });
    } finally {
      pushInFlight = false;
      currentPush = null;
    }
  })();
  currentPush = run;
  return run;
}

export function triggerPull(): Promise<void> {
  if (!getSyncState().online) return Promise.resolve();
  if (pullInFlight) return currentPull ?? Promise.resolve();
  pullInFlight = true;
  const run = (async () => {
    try {
      await pullOnce();
      setSyncState({ lastError: null, lastErrorAt: null });
      invalidateAfterSync();
    } catch (err) {
      setSyncState({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString() });
    } finally {
      pullInFlight = false;
      currentPull = null;
    }
  })();
  currentPull = run;
  return run;
}

export async function runSyncCycle(): Promise<void> {
  await triggerPush();
  await triggerPull();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
