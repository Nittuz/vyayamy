/**
 * The emailed sign-in code is six digits. Users paste it from a mail client
 * that may add spaces or a trailing newline, and iOS may autofill it with
 * separators — normalization keeps only the digits and caps the length.
 */
import { SIGN_IN_CODE_LENGTH, isCompleteSignInCode, normalizeSignInCode } from '@/auth/signInCode';

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
