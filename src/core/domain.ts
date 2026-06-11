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

export type { Exercise, PersonalRecord, Profile, Template, TrainingPlan, TrainingPlanSlot, Workout, WorkoutExercise };
export type { Set } from '@/db/types';

export type Units = Profile['units'];

export const WEEK_START_DAY = 1;

export type PRType = 'heaviest_weight' | 'best_volume' | 'most_reps_at_weight';

export type PRValue =
  | { type: 'heaviest_weight'; value: number }
  | { type: 'best_volume'; value: number }
  | { type: 'most_reps_at_weight'; value: { weight: number; reps: number } };

export function parsePRValue(type: string, raw: Json): PRValue | null {
  switch (type) {
    case 'heaviest_weight':
      return typeof raw === 'number' ? { type, value: raw } : null;
    case 'best_volume':
      return typeof raw === 'number' ? { type, value: raw } : null;
    case 'most_reps_at_weight':
      if (raw != null && typeof raw === 'object' && 'weight' in raw && 'reps' in raw) {
        const obj = raw as { weight: number; reps: number };
        return { type, value: obj };
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
