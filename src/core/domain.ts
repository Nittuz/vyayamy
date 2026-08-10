/**
 * Domain glossary — canonical names and definitions for FlexYug's
 * product concepts.
 */
import type {
  Exercise,
  Json,
  PersonalRecord,
  Profile,
  Set as SetRow,
  Template,
  TrainingPlan,
  TrainingPlanSlot,
  Workout,
  WorkoutExercise,
} from '@/db/types';

export type {
  Exercise,
  PersonalRecord,
  Profile,
  Template,
  TrainingPlan,
  TrainingPlanSlot,
  Workout,
  WorkoutExercise,
};
export type { Set } from '@/db/types';

export type Units = Profile['units'];

export type PRType = 'heaviest_weight' | 'most_reps';

export type PRValue =
  | { type: 'heaviest_weight'; value: number }
  /** weight null = a bodyweight record (set-entry spec §4: BW is NULL, never 0). */
  | { type: 'most_reps'; value: { reps: number; weight: number | null } };

// 'best_volume' and 'most_reps_at_weight' are retired types (2026-08-09 spec);
// they fall through to the default null and their cached rows are deleted by
// the recompute in personalRecords.ts.
export function parsePRValue(type: string, raw: Json): PRValue | null {
  switch (type) {
    case 'heaviest_weight':
      return typeof raw === 'number' ? { type, value: raw } : null;
    case 'most_reps':
      if (raw != null && typeof raw === 'object' && 'reps' in raw) {
        const obj = raw as { reps: unknown; weight?: unknown };
        if (typeof obj.reps !== 'number') return null;
        return {
          type,
          value: { reps: obj.reps, weight: typeof obj.weight === 'number' ? obj.weight : null },
        };
      }
      return null;
    default:
      return null;
  }
}

export type WorkoutStatus = 'active' | 'completed';

export function deriveWorkoutStatus(workout: Workout): WorkoutStatus {
  return workout.ended_at == null ? 'active' : 'completed';
}

export type WorkoutSummary = {
  completedSets: number;
  totalSets: number;
  volume: number;
  prCount: number;
  duration: string;
};

export type GroupedPR = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  records: {
    id: string;
    type: PRType;
    displayValue: string;
    achievedAt: string;
    isRecent: boolean;
  }[];
  hasRecent: boolean;
};

export type SyncState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export type SlotDraft = {
  key: string;
  templateId: string | null;
  isRestDay: boolean;
  label: string;
  dayOfWeek?: number;
  cyclePosition?: number;
};

export type { SetRow };
