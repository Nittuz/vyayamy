/**
 * Pure notification-permission state (no expo import, so it is testable).
 *
 * 'provisional' is iOS quiet-delivery: notifications arrive silently in
 * Notification Center with no banner/sound and no prompt was ever shown — the
 * rest alert is effectively muted. The app distinguishes it so it can prompt
 * for real, and surfaces 'denied' so it can point the user at Settings (#158).
 */
export type RestAlertStatus = 'granted' | 'provisional' | 'denied' | 'undetermined';

export function deriveRestAlertStatus(p: {
  granted: boolean;
  provisional: boolean;
  canAskAgain: boolean;
}): RestAlertStatus {
  if (p.granted) return 'granted';
  if (p.provisional) return 'provisional';
  if (!p.canAskAgain) return 'denied';
  return 'undetermined';
}
