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
