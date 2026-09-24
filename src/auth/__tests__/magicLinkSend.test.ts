/**
 * Outcome of a magic-link send. A rate-limited send is not a bad address:
 * the user already has a recent email, so the code card must still open,
 * with copy that says what actually happened. Everything else stays one
 * neutral failure (account existence must not leak, #92).
 */
import { classifyMagicLinkSend } from '@/auth/magicLinkSend';

describe('classifyMagicLinkSend', () => {
  test('no error is a send', () => {
    expect(classifyMagicLinkSend(null)).toBe('sent');
  });

  test('HTTP 429 is rate-limited', () => {
    expect(classifyMagicLinkSend({ status: 429 })).toBe('rate-limited');
  });

  test('GoTrue’s rate-limit code is rate-limited even without a status', () => {
    expect(classifyMagicLinkSend({ code: 'over_email_send_rate_limit' })).toBe('rate-limited');
  });

  test('any other error is a neutral failure', () => {
    expect(classifyMagicLinkSend({ status: 400, code: 'validation_failed' })).toBe('failed');
    expect(classifyMagicLinkSend({})).toBe('failed');
  });
});
