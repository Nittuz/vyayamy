/**
 * Outcome of a magic-link send. A rate-limited send is not a bad address:
 * the user already has a recent email, so the code card must still open,
 * with copy that says what actually happened. Everything else stays one
 * neutral failure (account existence must not leak, #92).
 */
import { classifyMagicLinkSend, sentCardCopy } from '@/auth/magicLinkSend';

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

describe('sentCardCopy', () => {
  test('a fresh send promises the email', () => {
    expect(sentCardCopy('sent')).toMatch(/on its way/);
  });

  test('a rate-limited send says no email went out and points at the latest one', () => {
    expect(sentCardCopy('rate-limited')).toMatch(/No new email/);
    expect(sentCardCopy('rate-limited')).toMatch(/latest email/);
  });

  test('entering a code you already have never claims an email was sent', () => {
    const copy = sentCardCopy('have-code');
    expect(copy).not.toMatch(/on its way/);
    expect(copy).toMatch(/latest/);
  });
});
