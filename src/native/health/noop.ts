import type { HealthAdapter } from './types';

export const noopHealthAdapter: HealthAdapter = {
  platform: 'unsupported',
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
