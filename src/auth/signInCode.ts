/**
 * The emailed sign-in code (GoTrue's email OTP, `{{ .Token }}` in
 * the magic-link template). Mail clients and iOS autofill can hand it over
 * with spaces, separators, or a trailing newline; only the digits count.
 */
// Must match the hosted project's Auth → Email → "Email OTP Length" (8; the
// local supabase/config.toml pins the same). A shorter cap silently truncates
// real codes — TestFlight build 8 shipped with 6 and every code failed.
export const SIGN_IN_CODE_LENGTH = 8;

export function normalizeSignInCode(raw: string): string {
  return raw.replace(/\D+/g, '').slice(0, SIGN_IN_CODE_LENGTH);
}

export function isCompleteSignInCode(code: string): boolean {
  return code.length === SIGN_IN_CODE_LENGTH && /^\d+$/.test(code);
}

/**
 * Submit on the keystroke (or autofill paste) that completes the code — the
 * iOS number pad has no Done key and covers the button, so completion is the
 * gesture. Fires once: a re-render with an already-complete code must not
 * re-submit.
 */
export function shouldSubmitSignInCode(prev: string, next: string): boolean {
  return isCompleteSignInCode(next) && !isCompleteSignInCode(prev);
}
