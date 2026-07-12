import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { captureException } from '@/lib/errorReporting';

import { exchangeCodeForSession } from './authActions';
import { reportAuthError } from './AuthContext';

/**
 * Handle the magic-link deep link at the root so it fires regardless of which
 * route the OS dropped us into. Previously this lived only in /login, so a
 * user already on /today would never have their code consumed. The ref guards
 * React 19 strict-mode's double-mount in dev (otherwise exchangeCodeForSession
 * runs twice and the second call returns "code already used").
 *
 * Failures surface (#94): both a returned exchange error (expired or already
 * used code) and a thrown one report `magic-link-failed` through
 * `reportAuthError`, which AuthProvider exposes as `authError` and Login
 * renders with resend/password recovery.
 */
export function useMagicLinkHandler(): void {
  const initialUrlConsumed = useRef(false);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      let code: string | null = null;
      try {
        const parsed = Linking.parse(url);
        code = (parsed.queryParams?.code as string | undefined) ?? null;
      } catch {
        return; // Not a link we can read — nothing to exchange.
      }
      if (!code) return;
      try {
        const { error } = await exchangeCodeForSession(code);
        if (error) {
          reportAuthError('magic-link-failed');
          return;
        }
        router.replace('/');
      } catch (err) {
        captureException(err, { scope: 'magic-link-exchange' });
        reportAuthError('magic-link-failed');
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
