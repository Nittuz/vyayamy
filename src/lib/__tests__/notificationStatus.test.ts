import { deriveRestAlertStatus } from '@/lib/notificationStatus';

describe('deriveRestAlertStatus (#158)', () => {
  test('granted wins', () => {
    expect(deriveRestAlertStatus({ granted: true, provisional: false, canAskAgain: false })).toBe('granted');
  });
  test('provisional (quiet) is distinct from granted', () => {
    expect(deriveRestAlertStatus({ granted: false, provisional: true, canAskAgain: false })).toBe('provisional');
  });
  test('not granted and cannot ask again → denied (surface a Settings deep-link)', () => {
    expect(deriveRestAlertStatus({ granted: false, provisional: false, canAskAgain: false })).toBe('denied');
  });
  test('not granted but can still ask → undetermined (prime is worthwhile)', () => {
    expect(deriveRestAlertStatus({ granted: false, provisional: false, canAskAgain: true })).toBe('undetermined');
  });
});
