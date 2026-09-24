/**
 * Applies the in-app Appearance preference through React Native's Appearance
 * override, so useColorScheme (hence useTheme, the boot overlay, the status
 * bar) AND native surfaces (keyboard, modals) follow the same choice. Kept
 * apart from appearancePref.ts because `Appearance` needs the RN runtime,
 * which the jest environment stubs.
 */
import { useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import {
  loadAppearancePref,
  resolveAppearanceOverride,
  saveAppearancePref,
  type AppearancePref,
} from './appearancePref';

export function applyAppearancePref(pref: AppearancePref): void {
  // RN 0.85 spells "no override" as 'unspecified'; the pure module uses null.
  Appearance.setColorScheme(resolveAppearanceOverride(pref) ?? 'unspecified');
}

/** Boot: read the saved preference and apply it before anything draws. */
export async function restoreAppearancePref(): Promise<AppearancePref> {
  const pref = await loadAppearancePref();
  applyAppearancePref(pref);
  return pref;
}

/** Profile's control: the saved preference plus a setter that saves and applies. */
export function useAppearancePref(): {
  pref: AppearancePref;
  setPref: (next: AppearancePref) => void;
} {
  const [pref, setPrefState] = useState<AppearancePref>('system');
  useEffect(() => {
    let cancelled = false;
    void loadAppearancePref().then((p) => {
      if (!cancelled) setPrefState(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setPref = useCallback((next: AppearancePref) => {
    setPrefState(next);
    applyAppearancePref(next);
    void saveAppearancePref(next);
  }, []);
  return { pref, setPref };
}
