import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitChange();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitChange();
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getCanInstall() {
  return deferredPrompt !== null;
}

/**
 * Captures the `beforeinstallprompt` event and exposes install capability.
 * Returns `canInstall` (true when browser supports install) and `promptInstall`.
 */
export function usePWAInstall() {
  const canInstall = useSyncExternalStore(subscribe, getCanInstall, () => false);
  const promptRef = useRef(deferredPrompt);

  useEffect(() => {
    promptRef.current = deferredPrompt;
  });

  const promptInstall = useCallback(async () => {
    const prompt = promptRef.current ?? deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
      emitChange();
    }
  }, []);

  return { canInstall, promptInstall };
}
