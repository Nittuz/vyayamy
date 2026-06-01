/**
 * Active-skin state + persistence.
 *
 * The skin is a device-display preference (not synced) stored in AsyncStorage.
 * Hydrated once at launch; `app/_layout.tsx` gates first paint on `hydrated` so
 * the app never flashes the default skin before the stored one loads.
 *
 * Pure coercion/validation lives in `skins.ts` (`coerceSkin`) and is unit-tested
 * there; this provider is the thin React/AsyncStorage shell, verified on device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { coerceSkin, DEFAULT_SKIN, type SkinId } from './skins';

export const SKIN_STORAGE_KEY = 'flexyug.skin';

interface SkinContextValue {
  skin: SkinId;
  setSkin: (id: SkinId) => Promise<void>;
  hydrated: boolean;
}

const SkinContext = createContext<SkinContextValue | null>(null);

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<SkinId>(DEFAULT_SKIN);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SKIN_STORAGE_KEY)
      .then((stored) => {
        if (active) setSkinState(coerceSkin(stored));
      })
      .catch(() => {
        /* keep default */
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SkinContextValue>(
    () => ({
      skin,
      hydrated,
      setSkin: async (id: SkinId) => {
        setSkinState(id);
        try {
          await AsyncStorage.setItem(SKIN_STORAGE_KEY, id);
        } catch {
          /* best-effort persistence */
        }
      },
    }),
    [skin, hydrated],
  );

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useSkin must be used within SkinProvider');
  return ctx;
}
