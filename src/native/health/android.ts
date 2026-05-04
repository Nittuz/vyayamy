/**
 * Health Connect adapter (Android).
 *
 * Integration is deferred to Phase 6. When ready:
 *   1. `npx expo install react-native-health-connect`
 *   2. Add the Health Connect permissions to `android.permissions` in
 *      `app.config.ts` (e.g. `android.permission.health.WRITE_EXERCISE`).
 *   3. Replace the stub bodies with real `initialize`,
 *      `requestPermission`, and `insertRecords` calls.
 *
 * Until then we expose a typed stub so the dispatcher can return a
 * sensible default without the native module installed.
 */

import type { HealthAdapter } from './types';

export const androidHealthAdapter: HealthAdapter = {
  platform: 'android',
  async isAvailable() {
    return false;
  },
  async requestPermissions() {
    return false;
  },
  async saveWorkout() {
    return { externalId: null };
  },
};
