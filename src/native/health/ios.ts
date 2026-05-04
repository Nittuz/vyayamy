/**
 * HealthKit adapter (iOS).
 *
 * Integration is deferred to Phase 6. When ready:
 *   1. `npx expo install react-native-health`
 *   2. Add the HealthKit entitlement + NSHealthShareUsageDescription /
 *      NSHealthUpdateUsageDescription to `app.config.ts` under
 *      `ios.infoPlist`.
 *   3. Flesh out the functions below using `AppleHealthKit` from
 *      `react-native-health`.
 *
 * Until then we expose a typed stub that is a no-op so the rest of
 * the app can treat HealthKit as optional without crashing.
 */

import type { HealthAdapter } from './types';

export const iosHealthAdapter: HealthAdapter = {
  platform: 'ios',
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
