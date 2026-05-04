/**
 * Platform-agnostic health integration contract.
 *
 * Concrete implementations live in `./ios.ts` (HealthKit via
 * `react-native-health`) and `./android.ts` (Health Connect via
 * `react-native-health-connect`). The dispatcher in `./index.ts`
 * selects the correct one at runtime and falls back to a no-op
 * when neither library is installed.
 *
 * Nothing in the rest of the app imports from the native modules
 * directly. Everything goes through `getHealthAdapter()`.
 */

export interface WorkoutExport {
  startedAt: string;
  endedAt: string;
  totalVolumeKg?: number;
  totalReps?: number;
  exerciseNames?: string[];
}

export type HealthPermission =
  | 'workouts.write'
  | 'activeEnergy.write'
  | 'heartRate.read'
  | 'bodyMass.read';

export interface HealthAdapter {
  readonly platform: 'ios' | 'android' | 'unsupported';
  isAvailable(): Promise<boolean>;
  requestPermissions(permissions: HealthPermission[]): Promise<boolean>;
  saveWorkout(workout: WorkoutExport): Promise<{ externalId: string | null }>;
}
