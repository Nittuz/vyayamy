/**
 * The emailed sign-in code is eight digits (the hosted project's Email OTP
 * Length; supabase/config.toml pins the same). Users paste it from a mail client
 * that may add spaces or a trailing newline, and iOS may autofill it with
 * separators — normalization keeps only the digits and caps the length.
 */
import {
  SIGN_IN_CODE_LENGTH,
  isCompleteSignInCode,
  normalizeSignInCode,
  shouldSubmitSignInCode,
} from '@/auth/signInCode';

describe('normalizeSignInCode', () => {
  test('keeps digits only', () => {
    expect(normalizeSignInCode(' 3054 4934\n')).toBe('30544934');
  });

  test('caps at the code length', () => {
    expect(normalizeSignInCode('1234567890')).toBe('12345678');
  });

  test('drops letters and separators', () => {
    expect(normalizeSignInCode('12-34ab56cd78')).toBe('12345678');
  });
});

describe('isCompleteSignInCode', () => {
  test('true only for exactly eight digits', () => {
    expect(SIGN_IN_CODE_LENGTH).toBe(8);
    expect(isCompleteSignInCode('30544934')).toBe(true);
    expect(isCompleteSignInCode('3054493')).toBe(false);
    expect(isCompleteSignInCode('305449')).toBe(false);
    expect(isCompleteSignInCode('')).toBe(false);
  });
});

describe('shouldSubmitSignInCode', () => {
  test('fires once, on the keystroke that completes the code', () => {
    expect(shouldSubmitSignInCode('3054493', '30544934')).toBe(true);
  });

  test('does not fire while the code is still short', () => {
    expect(shouldSubmitSignInCode('305449', '3054493')).toBe(false);
  });

  test('does not fire again when the code was already complete', () => {
    expect(shouldSubmitSignInCode('30544934', '30544934')).toBe(false);
  });

  test('fires when autofill lands all eight digits at once', () => {
    expect(shouldSubmitSignInCode('', '30544934')).toBe(true);
  });
});
