import { Platform } from 'react-native';

import { androidHealthAdapter } from './android';
import { iosHealthAdapter } from './ios';
import { noopHealthAdapter } from './noop';
import type { HealthAdapter } from './types';

export type { HealthAdapter, HealthPermission, WorkoutExport } from './types';

export function getHealthAdapter(): HealthAdapter {
  if (Platform.OS === 'ios') return iosHealthAdapter;
  if (Platform.OS === 'android') return androidHealthAdapter;
  return noopHealthAdapter;
}
