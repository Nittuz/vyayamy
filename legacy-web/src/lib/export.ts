/**
 * Export module — separated into:
 *   1. Data fetching (Supabase)
 *   2. Pure serialization (no DOM — reusable by native clients)
 *   3. Web-specific download helper
 *   4. Orchestrator functions (fetch + serialize + download)
 */

import type {
  Profile, Exercise, Workout, WorkoutExercise,
  Set as SetRow, PersonalRecord, Template,
  TrainingPlan, TrainingPlanSlot,
} from '../types/database';
import type { ExportData } from './domain';
import { EXPORT_FORMAT, EXPORT_VERSION } from './domain';
import { supabase } from './supabase';

// ── Types for the nested Supabase response ──

type NestedWorkoutExercise = WorkoutExercise & {
  exercises: { name: string; muscle_group: string | null } | null;
  sets: SetRow[];
};

type NestedWorkout = Workout & {
  workout_exercises: NestedWorkoutExercise[];
};

type NestedPlan = TrainingPlan & {
  training_plan_slots: TrainingPlanSlot[];
};

// ── 1. Data fetching ──

export async function fetchAllUserData(userId: string): Promise<ExportData> {
  const [profileRes, workoutsRes, exercisesRes, templatesRes, plansRes, recordsRes] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase
        .from('workouts')
        .select('*, workout_exercises(*, exercises(name, muscle_group), sets(*))')
        .eq('user_id', userId)
        .order('started_at', { ascending: false }),
      supabase.from('exercises').select('*').or(`user_id.eq.${userId},user_id.is.null`),
      supabase.from('templates').select('*').eq('user_id', userId),
      supabase
        .from('training_plans')
        .select('*, training_plan_slots(*)')
        .eq('user_id', userId),
      supabase.from('personal_records').select('*').eq('user_id', userId),
    ]);

  if (workoutsRes.error) throw workoutsRes.error;

  const nestedWorkouts = (workoutsRes.data ?? []) as NestedWorkout[];

  const allSets: SetRow[] = [];
  const allSlots: TrainingPlanSlot[] = [];

  for (const w of nestedWorkouts) {
    for (const we of w.workout_exercises ?? []) {
      for (const s of we.sets ?? []) {
        allSets.push(s);
      }
    }
  }

  const nestedPlans = (plansRes.data ?? []) as NestedPlan[];
  const plans: TrainingPlan[] = [];
  for (const p of nestedPlans) {
    const { training_plan_slots, ...plan } = p;
    plans.push(plan as TrainingPlan);
    for (const slot of training_plan_slots ?? []) {
      allSlots.push(slot);
    }
  }

  return {
    profile: (profileRes.data as Profile) ?? null,
    workouts: nestedWorkouts as Workout[],
    exercises: (exercisesRes.data ?? []) as Exercise[],
    sets: allSets,
    templates: (templatesRes.data ?? []) as Template[],
    trainingPlans: plans,
    trainingPlanSlots: allSlots,
    personalRecords: (recordsRes.data ?? []) as PersonalRecord[],
  };
}

// ── 2. Pure serialization ──

/** Serialize export data as a JSON string. No DOM dependency. */
export function serializeJSON(data: ExportData): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      ...data,
    },
    null,
    2,
  );
}

/** Serialize export data as a CSV string (one row per set). No DOM dependency. */
export function serializeCSV(data: ExportData): string {
  const headers = [
    'workout_date',
    'workout_title',
    'exercise_name',
    'muscle_group',
    'set_number',
    'weight',
    'reps',
    'completed',
  ];

  type NestedW = Workout & {
    workout_exercises?: Array<WorkoutExercise & {
      exercises?: { name?: string; muscle_group?: string | null } | null;
      sets?: SetRow[];
    }>;
  };

  const rows: string[][] = [];

  for (const w of data.workouts as NestedW[]) {
    const date = w.started_at?.slice(0, 10) ?? '';
    const title = w.title ?? '';

    for (const we of w.workout_exercises ?? []) {
      const exerciseName = we.exercises?.name ?? '';
      const muscleGroup = we.exercises?.muscle_group ?? '';
      const sorted = [...(we.sets ?? [])].sort((a, b) => a.order_index - b.order_index);

      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        rows.push([
          date,
          title,
          exerciseName,
          muscleGroup,
          String(i + 1),
          s.weight != null ? String(s.weight) : '',
          s.reps != null ? String(s.reps) : '',
          s.completed ? 'yes' : 'no',
        ]);
      }
    }
  }

  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

// ── 3. Web-specific download ──

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── 4. Orchestrators ──

export async function exportJSON(userId: string): Promise<void> {
  const data = await fetchAllUserData(userId);
  const json = serializeJSON(data);
  downloadFile(json, `vyayamy-export-${todayStamp()}.json`, 'application/json');
}

export async function exportCSV(userId: string): Promise<void> {
  const data = await fetchAllUserData(userId);
  const csv = serializeCSV(data);
  downloadFile(csv, `vyayamy-workouts-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
}

// TODO(beta-follow-up): Add import deserialization + validation against ExportEnvelope shape.
// Minimum viable: parse JSON export, validate version/format, upsert exercises + templates.
// Workout history import can be deferred — templates are highest-value for switching users.
