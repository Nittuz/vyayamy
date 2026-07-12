import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { setUser as setReportingUser } from '@/lib/errorReporting';

import { supabase } from './supabase';

/** User-facing auth failures that need a recovery path on Login. */
export type AuthErrorCode = 'magic-link-failed';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Latest surfaced auth failure (e.g. an expired magic link, #94). */
  authError: AuthErrorCode | null;
  clearAuthError: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  authError: null,
  clearAuthError: () => {},
});

// The magic-link handler mounts in the root layout OUTSIDE this provider, so
// failures flow through a module-level external store the provider reads via
// useSyncExternalStore (#94). The store also holds an error reported before
// the provider mounts.
let storedAuthError: AuthErrorCode | null = null;
const authErrorListeners = new Set<() => void>();

function publishAuthError(code: AuthErrorCode | null): void {
  storedAuthError = code;
  authErrorListeners.forEach((notify) => notify());
}

/** Report an auth failure from outside React (e.g. the deep-link handler). */
export function reportAuthError(code: AuthErrorCode): void {
  publishAuthError(code);
}

function subscribeAuthErrors(onChange: () => void): () => void {
  authErrorListeners.add(onChange);
  return () => authErrorListeners.delete(onChange);
}

function getAuthErrorSnapshot(): AuthErrorCode | null {
  return storedAuthError;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const authError = useSyncExternalStore(subscribeAuthErrors, getAuthErrorSnapshot);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      // Identify by user id only — email is PII and not needed to triage errors.
      const u = nextSession?.user ?? null;
      setReportingUser(u ? { id: u.id } : null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => publishAuthError(null), []);

  // A live session makes a pending link error moot (successful retry, or an
  // already-signed-in user tapping a stale link). Clear it so a future Login
  // visit doesn't render stale failure copy.
  useEffect(() => {
    if (session && authError) publishAuthError(null);
  }, [session, authError]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, authError, clearAuthError }),
    [session, loading, authError, clearAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
