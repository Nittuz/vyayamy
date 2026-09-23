/**
 * The emailed sign-in code (GoTrue's six-digit email OTP, `{{ .Token }}` in
 * the magic-link template). Mail clients and iOS autofill can hand it over
 * with spaces, separators, or a trailing newline; only the digits count.
 */
export const SIGN_IN_CODE_LENGTH = 6;

export function normalizeSignInCode(raw: string): string {
  return raw.replace(/\D+/g, '').slice(0, SIGN_IN_CODE_LENGTH);
}

export function isCompleteSignInCode(code: string): boolean {
  return code.length === SIGN_IN_CODE_LENGTH && /^\d+$/.test(code);
}
