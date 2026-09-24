/**
 * Outcome of a magic-link send, from the GoTrue error (if any).
 *
 * 'rate-limited' is the one failure the UI must treat differently: the
 * address was fine and a recent email already exists, so the code card
 * stays reachable instead of sending the user off to "check the address".
 * Every other failure collapses to one neutral message (#92).
 */
export type MagicLinkSendOutcome = 'sent' | 'rate-limited' | 'failed';

export interface MagicLinkSendError {
  status?: number;
  code?: string;
}

export function classifyMagicLinkSend(err: MagicLinkSendError | null): MagicLinkSendOutcome {
  if (!err) return 'sent';
  if (err.status === 429 || err.code === 'over_email_send_rate_limit') return 'rate-limited';
  return 'failed';
}

/** How the code card was reached; each mode needs copy that matches reality. */
export type SentCardMode = 'sent' | 'rate-limited' | 'have-code';

export function sentCardCopy(mode: SentCardMode): string {
  switch (mode) {
    case 'sent':
      return 'Your sign-in link is on its way. Open it on this phone, or enter the code from the email here.';
    case 'rate-limited':
      return 'No new email this time: too many were sent just now. Use the code from your latest email, or wait a few minutes to resend.';
    case 'have-code':
      return 'Enter the code from your latest FlexYug email. Codes expire 15 minutes after they are sent.';
  }
}
