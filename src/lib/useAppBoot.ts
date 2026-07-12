/**
 * Boot orchestration for the root layout: SQLite init (with a timeout race so
 * a hung driver surfaces as a boot error instead of an eternal spinner),
 * Today-snapshot hydration, splash hide, and sync-engine start/stop.
 */
import type { QueryClient } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { initDb } from '@/db/client';
import { removeKv } from '@/lib/kvStore';
import { startSyncEngine, stopSyncEngine } from '@/sync/engine';
import { hydrateSnapshot } from '@/ui/todaySnapshot';

// Web does an extra wasm fetch + worker spin-up, which can be slow on a cold load.
const INIT_TIMEOUT_MS = Platform.OS === 'web' ? 15_000 : 5_000;

export function useAppBoot(queryClient: QueryClient): {
  ready: boolean;
  bootError: string | null;
} {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        // Hydrate the Today snapshot in parallel with SQLite init so the first paint
        // has render-ready state. Don't await — initDb is the gate, hydrate races it.
        void hydrateSnapshot();
        // One-time cleanup: drop the legacy skin preference left behind by the
        // retired multi-skin system. Best-effort, errors swallowed by removeKv.
        void removeKv('flexyug.skin');
        await Promise.race([
          initDb(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Database init exceeded ${INIT_TIMEOUT_MS}ms`)),
              INIT_TIMEOUT_MS,
            ),
          ),
        ]);
        setReady(true);
        startSyncEngine(queryClient);
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      } finally {
        void SplashScreen.hideAsync();
      }
    })();

    return () => {
      stopSyncEngine();
    };
    // queryClient is a module-level singleton in the root layout; the boot
    // effect intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready, bootError };
}
