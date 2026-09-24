/**
 * Auth facade. The Supabase client is an architectural boundary: only src/auth
 * and src/sync may import it (enforced by no-restricted-imports). Everything else
 * — screens, the root layout — calls these named operations, so the surface the
 * app depends on is small and explicit (#35).
 */
import { supabase } from './supabase';

export function signInWithOtp(email: string, emailRedirectTo: string) {
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function exchangeCodeForSession(code: string) {
  return supabase.auth.exchangeCodeForSession(code);
}

/**
 * The sign-in-code half of the magic-link email: the same email carries a
 * link (works only in Safari/Apple Mail on the requesting phone) and a
 * numeric code that works from any mail client on any device.
 */
export function verifyEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: 'email' });
}
