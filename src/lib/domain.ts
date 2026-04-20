/**
 * Domain glossary — canonical names and definitions for Vyayamy's product concepts.
 *
 * Re-exports the core row types from database.ts with product-level documentation,
 * plus product-level types that go beyond raw DB rows.
 *
 * Import domain types from here when you need the conceptual definition,
 * or directly from `../types/database` when working with raw Supabase rows.
 */

import type { Json, PersonalRecord, Profile, Template, Workout, Set as SetRow } from '../types/database';

// ── Row type re-exports ──

/** A movement in the exercise library. `user_id = null` means global seed data. */
export type { Exercise } from '../types/database';

/**
 * A reusable workout shape — a named, ordered list of exercises.
 * In the UI, we always call these "templates" (not "routines").
 */
export type { Template } from '../types/database';

/** A multi-day training schedule (weekly or rotating cycle). */
export type { TrainingPlan } from '../types/database';

/** One day/position within a training plan. */
export type { TrainingPlanSlot } from '../types/database';

/**
 * A performed workout session.
 * `ended_at` is null while the workout is active.
 */
export type { Workout } from '../types/database';

/** The ordered link between a workout and an exercise within it. */
export type { WorkoutExercise } from '../types/database';

/** A single set within a workout exercise: weight, reps, completion state. */
export type { Set } from '../types/database';

/** A personal record for a specific exercise and record type. */
export type { PersonalRecord } from '../types/database';

/** User profile: display name, preferred units, etc. */
export type { Profile } from '../types/database';

// ── Product-level types ──

/** User-preferred weight units. */
export type Units = Profile['units'];

/** Monday = 1. Used by both plan scheduling and frequency analytics. */
export const WEEK_START_DAY = 1;

/** The recognized personal-record categories. */
// TODO(phase-6): add 'best_estimated_1rm' when backend supports it
export type PRType = 'heaviest_weight' | 'best_volume' | 'most_reps_at_weight';

/**
 * Typed wrapper for the opaque `Json` value stored in `personal_records.value`.
 * Discriminated on `type` so consumers can safely narrow.
 */
export type PRValue =
  | { type: 'heaviest_weight'; value: number }
  | { type: 'best_volume'; value: number }
  | { type: 'most_reps_at_weight'; value: { weight: number; reps: number } };

/** Parse the opaque Json column into a typed PRValue, returning null if unrecognized. */
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

/** Whether a workout is in-progress or finished. */
export type WorkoutStatus = 'active' | 'completed';

export function deriveWorkoutStatus(workout: Workout): WorkoutStatus {
  return workout.ended_at == null ? 'active' : 'completed';
}

/** Summary produced at the end of a workout session. */
export type WorkoutSummary = {
  completedSets: number;
  totalSets: number;
  volume: number;
  prCount: number;
  duration: string;
};

/** A grouped view of personal records for one exercise (used in Progress). */
export type GroupedPR = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  records: Array<{
    id: string;
    type: PRType;
    displayValue: string;
    achievedAt: string;
    isRecent: boolean;
  }>;
  hasRecent: boolean;
};

/**
 * Persistence / sync lifecycle state.
 * Shared across components that display save status.
 */
export type SyncState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

/**
 * Draft representation of a plan slot during plan editing.
 * Used by PlanSetup for both weekly and cycle plan types.
 */
export type SlotDraft = {
  key: string;
  templateId: string | null;
  isRestDay: boolean;
  label: string;
  dayOfWeek?: number;
  cyclePosition?: number;
};

// ── Export / portability types ──

export const EXPORT_FORMAT = 'vyayamy-export-v1';
export const EXPORT_VERSION = 1;

/** Typed shape for the full user-data export payload. */
export type ExportData = {
  profile: Profile | null;
  workouts: Workout[];
  exercises: import('../types/database').Exercise[];
  sets: SetRow[];
  templates: Template[];
  trainingPlans: import('../types/database').TrainingPlan[];
  trainingPlanSlots: import('../types/database').TrainingPlanSlot[];
  personalRecords: PersonalRecord[];
};

/** The envelope written to the exported JSON file. */
export type ExportEnvelope = {
  exportedAt: string;
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
} & ExportData;
