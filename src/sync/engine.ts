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
import { pushOutbox } from './push';
import { getSyncState, setSyncState } from './state';

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

/**
 * Single sync mutex serializing all push/pull database work.
 *
 * `expo-sqlite`'s `withTransactionAsync` is not concurrency-safe — its raw
 * BEGIN/COMMIT cannot nest, so a push transaction overlapping a pull
 * transaction collides and throws "cannot rollback - no transaction is active"
 * (masking the real error). The `pushInFlight`/`pullInFlight` guards only
 * prevent push-vs-push and pull-vs-pull; push and pull can still overlap each
 * other when triggered from different events (network + auth on startup). This
 * mutex makes every sync transaction mutually exclusive on the single SQLite
 * connection.
 *
 * When uncontended it invokes `fn` synchronously (no microtask defer) so the
 * caller's in-flight bookkeeping and call ordering are unchanged; concurrent
 * callers queue and run in FIFO order once the lock frees.
 */
let syncLocked = false;
const syncWaiters: Array<() => void> = [];

function releaseSyncLock(): void {
  const next = syncWaiters.shift();
  if (next) {
    next(); // hand the lock to the next waiter (stays locked)
  } else {
    syncLocked = false;
  }
}

function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!syncLocked) {
    syncLocked = true;
    return invokeAndRelease(fn);
  }
  return new Promise<T>((resolve, reject) => {
    syncWaiters.push(() => {
      invokeAndRelease(fn).then(resolve, reject);
    });
  });
}

function invokeAndRelease<T>(fn: () => Promise<T>): Promise<T> {
  let result: Promise<T>;
  try {
    result = Promise.resolve(fn());
  } catch (err) {
    releaseSyncLock();
    return Promise.reject(err);
  }
  return result.then(
    (v) => {
      releaseSyncLock();
      return v;
    },
    (err) => {
      releaseSyncLock();
      throw err;
    },
  );
}

export function startSyncEngine(queryClient: QueryClient) {
  client = queryClient;
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
  netSub?.();
  netSub = null;
  authSub?.unsubscribe();
  authSub = null;
  appStateSub?.remove();
  appStateSub = null;
  client = null;
}

async function handleSignOut(): Promise<void> {
  // Cancel any in-flight cycles by zeroing the engine state, drop React Query
  // caches so screens don't render the previous user's data while we wait, and
  // delete the on-device SQLite file so a follow-up sign-in starts clean.
  pushInFlight = false;
  pullInFlight = false;
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

export async function triggerPush(): Promise<void> {
  if (!getSyncState().online) return;
  if (pushInFlight) return;
  pushInFlight = true;
  try {
    await withSyncLock(() => pushOutbox());
    setSyncState({ lastError: null, lastErrorAt: null });
    invalidateAfterSync();
  } catch (err) {
    setSyncState({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString() });
  } finally {
    pushInFlight = false;
  }
}

export async function triggerPull(): Promise<void> {
  if (!getSyncState().online) return;
  if (pullInFlight) return;
  pullInFlight = true;
  try {
    await withSyncLock(() => pullOnce());
    setSyncState({ lastError: null, lastErrorAt: null });
    invalidateAfterSync();
  } catch (err) {
    setSyncState({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString() });
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
