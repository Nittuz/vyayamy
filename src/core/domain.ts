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

/**
 * A record's numeric payload, already converted to the caller's display unit
 * (impeccable polish C) — the structured sibling of `displayValue`. Callers
 * that need to compose their own layout (stat tiles, the row-list strip) read
 * this instead of re-parsing the formatted string; `displayValue` stays for
 * callers that just want the ready-made text. `weight` is null on a
 * bodyweight `most_reps` record, matching PRValue's convention.
 */
export type GroupedPRRecordValue =
  | { type: 'heaviest_weight'; weight: number }
  | { type: 'most_reps'; reps: number; weight: number | null };

export type GroupedPR = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  records: {
    id: string;
    type: PRType;
    displayValue: string;
    /** Null only if the stored value fails to parse (corrupt row) — displayValue still degrades gracefully in that case. */
    value: GroupedPRRecordValue | null;
    achievedAt: string;
    isRecent: boolean;
  }[];
  hasRecent: boolean;
};

export type GroupedPRRecord = GroupedPR['records'][number];

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
