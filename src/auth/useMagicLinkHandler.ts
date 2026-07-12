import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { exchangeCodeForSession } from './authActions';

/**
 * Handle the magic-link deep link at the root so it fires regardless of which
 * route the OS dropped us into. Previously this lived only in /login, so a
 * user already on /today would never have their code consumed. The ref guards
 * React 19 strict-mode's double-mount in dev (otherwise exchangeCodeForSession
 * runs twice and the second call returns "code already used").
 */
export function useMagicLinkHandler(): void {
  const initialUrlConsumed = useRef(false);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        const parsed = Linking.parse(url);
        const code = (parsed.queryParams?.code as string | undefined) ?? null;
        if (!code) return;
        const { error } = await exchangeCodeForSession(code);
        if (!error) router.replace('/');
      } catch {
        // Swallow — we surface auth errors via the AuthProvider state, not here.
      }
    };
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    if (!initialUrlConsumed.current) {
      initialUrlConsumed.current = true;
      void Linking.getInitialURL().then((url) => {
        if (url) void handleUrl(url);
      });
    }
    return () => sub.remove();
  }, []);
}
