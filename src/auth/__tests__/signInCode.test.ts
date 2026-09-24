/**
 * The emailed sign-in code is six digits. Users paste it from a mail client
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
    expect(normalizeSignInCode(' 123 456\n')).toBe('123456');
  });

  test('caps at the code length', () => {
    expect(normalizeSignInCode('1234567890')).toBe('123456');
  });

  test('drops letters and separators', () => {
    expect(normalizeSignInCode('12-34ab56')).toBe('123456');
  });
});

describe('isCompleteSignInCode', () => {
  test('true only for exactly six digits', () => {
    expect(SIGN_IN_CODE_LENGTH).toBe(6);
    expect(isCompleteSignInCode('123456')).toBe(true);
    expect(isCompleteSignInCode('12345')).toBe(false);
    expect(isCompleteSignInCode('')).toBe(false);
  });
});

describe('shouldSubmitSignInCode', () => {
  test('fires once, on the keystroke that completes the code', () => {
    expect(shouldSubmitSignInCode('12345', '123456')).toBe(true);
  });

  test('does not fire while the code is still short', () => {
    expect(shouldSubmitSignInCode('1234', '12345')).toBe(false);
  });

  test('does not fire again when the code was already complete', () => {
    expect(shouldSubmitSignInCode('123456', '123456')).toBe(false);
  });

  test('fires when autofill lands all six digits at once', () => {
    expect(shouldSubmitSignInCode('', '726352')).toBe(true);
  });
});
