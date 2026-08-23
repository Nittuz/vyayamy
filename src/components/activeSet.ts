/**
 * Pure state-machine helpers for the Active-Set card flow.
 * Given the workout's exercises and the current cursor (which set is
 * being lifted), compute the next cursor on completion. Returns null
 * when the workout is finished (last set of last exercise).
 */
import { dayOfWeek } from '@/lib/dayOfWeek';
import { convertWeight, DEFAULT_UNITS } from '@/core/units';
import type { Set as SetRow } from '@/db/types';

export interface SetShape {
  id: string;
  weId: string;
  orderIndex: number;
  weight: number | null;
  reps: number | null;
  /** Unit the weight was logged in; null only for empty staged sets (#131). */
  units: 'kg' | 'lb' | null;
  completed: boolean;
}

export interface ExerciseShape {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  muscleGroup?: string | null; // optional for backwards-compat; Phase 3+ populates it
  sets: SetShape[];
}

/**
 * DB row → sheet shape (HistoryDetail reuses EditSetSheet, spec 2026-08-22
 * §1). `completed` comes back 0/1 through the sqlite driver despite the `Set`
 * type claiming boolean (see sets.test.ts) — coerce it for real.
 */
export function setRowToShape(s: SetRow): SetShape {
  return {
    id: s.id,
    weId: s.workout_exercise_id,
    orderIndex: s.order_index,
    weight: s.weight,
    reps: s.reps,
    units: s.units,
    completed: !!s.completed,
  };
}

/** Incomplete sets a Finish would prune (confirm gate, spec 2026-08-22 §3). */
export function countIncompleteSets(exercises: ExerciseShape[]): number {
  return exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.completed).length, 0);
}

export interface ActiveCursor {
  weId: string;
  setId: string;
}

/**
 * Outcome of one pass of the cursor-maintenance effect.
 *
 * `cursor` is a three-state field: absent (undefined) means "leave the cursor
 * state untouched"; `null` means "explicitly clear it" (empty workout, or the
 * whole workout is complete → recap); an object repositions it.
 */
export interface CursorResolution {
  cursor?: ActiveCursor | null;
  didInit: boolean;
  pendingTargetWeId: string | null;
}

/**
 * The screen's cursor-maintenance decision, ran on every exercises/cursor
 * change. Exact transplant of the inline effect from WorkoutActive (#21/#77);
 * current runtime behavior is the spec — see the characterization tests.
 *
 * - `didInit` distinguishes "cursor is null because we haven't loaded yet"
 *   (→ initialize) from "cursor is null because the user finished" (→ leave
 *   it null so the recap shows and we don't bounce back into a set).
 * - `pendingTargetWeId` is the add-exercise-from-recap target (#13): once that
 *   exercise's staged set arrives, the cursor lands on IT — not the first
 *   incomplete set anywhere.
 */
export function resolveCursor(
  exercises: ExerciseShape[],
  cursor: ActiveCursor | null,
  didInit: boolean,
  pendingTargetWeId: string | null,
): CursorResolution {
  if (exercises.length === 0) {
    return { cursor: null, didInit: false, pendingTargetWeId };
  }
  // Add-from-recap: target the just-added exercise's staged set once it loads.
  if (pendingTargetWeId) {
    const target = findExercise(exercises, pendingTargetWeId);
    if (target) {
      const set = firstIncompleteSet(target);
      if (set) {
        return {
          cursor: { weId: target.id, setId: set.id },
          didInit: true,
          pendingTargetWeId: null,
        };
      }
    }
    // exercise not in the cached data yet → wait for the next render
    return { didInit, pendingTargetWeId };
  }
  if (cursor) {
    // we have a real cursor → initialized
    const ex = findExercise(exercises, cursor.weId);
    if (ex) {
      const set = findSet(ex, cursor.setId);
      // Set not in the cached data yet — it was just created (advancing to a
      // new exercise stages a set before the query refetch lands). Keep the
      // cursor; the data will catch up.
      if (!set) return { didInit: true, pendingTargetWeId };
      if (!set.completed) return { didInit: true, pendingTargetWeId }; // valid working set
      // set exists and is completed → fall through and reposition
    }
    // cursor points at a missing exercise or a completed set → reposition
    return { cursor: findInitialCursor(exercises), didInit: true, pendingTargetWeId };
  }
  // cursor is null: initialize on first load. Once the user has finished
  // (deliberate null via "finish →"), leave it null so the recap shows and we
  // don't bounce them back into the first incomplete set.
  if (!didInit) {
    return { cursor: findInitialCursor(exercises), didInit: true, pendingTargetWeId };
  }
  return { didInit, pendingTargetWeId };
}

/** Values to pre-fill on the set auto-staged when a set is completed. */
export interface StagedSetPlan {
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

/**
 * Completing a set auto-stages the next one in the SAME exercise, pre-filled
 * with the completed set's weight × reps (Phase 3). The unit is stamped only
 * when a weight is carried over — null units mark an empty staged set (#131).
 * Exact transplant of the inline staging decision in onComplete (#21/#77).
 */
export function planStagedSet(currentSet: SetShape | null, units: 'kg' | 'lb'): StagedSetPlan {
  const weight = currentSet?.weight ?? null;
  const reps = currentSet?.reps ?? null;
  // Same session → same logging unit as the set just completed.
  return { weight, reps, units: weight != null ? units : null };
}

/** Reps make a set loggable; weight is optional — bodyweight (spec §4). */
export function canCompleteSet(set: Pick<SetShape, 'reps'> | null): boolean {
  return set?.reps != null;
}

/** `60 × 8` / `BW × 12` — the LOG SET echo and every logged-set value text. */
export function setValuesLabel(weight: number | null, reps: number | null): string {
  return `${weight ?? 'BW'} × ${reps ?? '-'}`;
}

/** A completed set from the previous session of the same exercise. */
export interface LastSessionSet {
  orderIndex: number;
  weight: number | null;
  reps: number | null;
  units: 'kg' | 'lb' | null;
}

/**
 * Prefill for the FIRST set of an exercise (spec §2): last session's first
 * set, falling back to its top set; weight converted to the current unit and
 * rounded to the current step. Empty history → truly empty stage.
 */
export function planFirstSet(
  lastSets: LastSessionSet[],
  units: 'kg' | 'lb',
  weightStep: number,
): StagedSetPlan {
  const first = lastSets[0] ?? null;
  const pick =
    first && (first.weight != null || first.reps != null) ? first : topLastSessionSet(lastSets);
  if (!pick) return { weight: null, reps: null, units: null };
  let weight: number | null = null;
  if (pick.weight != null) {
    const converted = convertWeight(pick.weight, pick.units ?? DEFAULT_UNITS, units);
    weight = roundToNearest(converted, weightStep);
  }
  return { weight, reps: pick.reps ?? null, units: weight != null ? units : null };
}

function topLastSessionSet(lastSets: LastSessionSet[]): LastSessionSet | null {
  let top: LastSessionSet | null = null;
  let topKg = -Infinity;
  for (const s of lastSets) {
    if (s.weight == null) {
      if (top == null && s.reps != null) top = s; // bodyweight history still seeds reps
      continue;
    }
    const kg = convertWeight(s.weight, s.units ?? DEFAULT_UNITS, 'kg');
    if (kg > topKg) {
      topKg = kg;
      top = s;
    }
  }
  return top;
}

function roundToNearest(value: number, step: number): number {
  // Kill FP dust the same way roundToStep does in numericStepper.ts.
  return Math.round(Math.round(value / step) * step * 1000) / 1000;
}

export function findInitialCursor(exercises: ExerciseShape[]): ActiveCursor | null {
  for (const ex of exercises) {
    const next = ex.sets.find((s) => !s.completed);
    if (next) return { weId: ex.id, setId: next.id };
  }
  // No incomplete set anywhere → the workout is done. Return null so the screen
  // shows the recap; returning a completed set here made the cursor-reset effect
  // reposition onto it every render (infinite setState loop, #15).
  return null;
}

export function findExercise(exercises: ExerciseShape[], weId: string): ExerciseShape | null {
  return exercises.find((e) => e.id === weId) ?? null;
}

export function findSet(ex: ExerciseShape, setId: string): SetShape | null {
  return ex.sets.find((s) => s.id === setId) ?? null;
}

export function completedSetsBeforeCursor(ex: ExerciseShape, cursor: ActiveCursor): SetShape[] {
  if (ex.id !== cursor.weId) return ex.sets.filter((s) => s.completed);
  const cursorIdx = ex.sets.findIndex((s) => s.id === cursor.setId);
  if (cursorIdx === -1) return ex.sets.filter((s) => s.completed);
  // Only completed sets render as ghosts (with a ✓); a skipped/incomplete set
  // before the cursor must not show as done (#16).
  return ex.sets.slice(0, cursorIdx).filter((s) => s.completed);
}

export function findNextExercise(
  exercises: ExerciseShape[],
  currentWeId: string,
): ExerciseShape | null {
  const idx = exercises.findIndex((e) => e.id === currentWeId);
  if (idx === -1) return null;
  if (idx + 1 >= exercises.length) return null;
  return exercises[idx + 1] ?? null;
}

export function findPrevExercise(
  exercises: ExerciseShape[],
  currentWeId: string,
): ExerciseShape | null {
  const idx = exercises.findIndex((e) => e.id === currentWeId);
  if (idx <= 0) return null;
  return exercises[idx - 1] ?? null;
}

/** First not-yet-completed set of an exercise, or null if all are done. */
export function firstIncompleteSet(ex: ExerciseShape): SetShape | null {
  return ex.sets.find((s) => !s.completed) ?? null;
}

/**
 * Header-title fallback for the active workout. Uses the day the workout
 * STARTED, never the current day — a session that crosses midnight must keep
 * reading "Saturday", not silently become "Sunday" (backlog 1.7 / #156).
 * An unparseable started_at falls back to today rather than rendering nothing.
 */
export function workoutHeaderTitle(
  title: string | null | undefined,
  startedAt: string | number | Date | null | undefined,
): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (trimmed !== '') return trimmed;
  if (startedAt != null) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) return dayOfWeek(d);
  }
  return dayOfWeek(new Date());
}

/** Mono strip for the active card's position line: `EXERCISE 2/3 · SET 4`. */
export function exerciseSetStrip(
  exerciseIndex: number,
  totalExercises: number,
  setIndex: number,
): string {
  return `EXERCISE ${exerciseIndex}/${totalExercises} · SET ${setIndex}`;
}

/** Mono strip for a banked (ghost) set row: `SET 1 · 60 × 8` / `SET 1 · BW × 12`. */
export function ghostSetStrip(
  displayIndex: number,
  set: Pick<SetShape, 'weight' | 'reps'>,
): string {
  return `SET ${displayIndex} · ${setValuesLabel(set.weight, set.reps)}`;
}

/** Identity + pre-filled values of the speculative set staged on completion. */
export interface AutoStagedSet {
  id: string;
  weight: number | null;
  reps: number | null;
  /** 'carry' = copied from the just-completed set; 'history' = last-session prefill (shows LAST TIME). */
  source?: 'carry' | 'history';
}

/**
 * Whether advancing past the current set (next exercise / finish) should warn
 * before discarding it.
 *
 * Completing a set auto-stages the next one pre-filled with the same weight ×
 * reps, so "has values" cannot tell a set the user actually entered from the
 * speculative one they never touched. A warning is only meaningful for a set the
 * user edited and left un-completed. The empty first set and the untouched
 * auto-staged set carry no intent, so they advance silently (the trailing staged
 * set is pruned on finish regardless).
 */
export function shouldConfirmLeavingSet(
  set: SetShape | null,
  autoStaged: AutoStagedSet | null,
): boolean {
  if (!set || set.completed) return false;
  if (set.weight == null && set.reps == null) return false;
  // Untouched auto-staged set: same id and still holding the values we pre-filled.
  if (
    autoStaged != null &&
    set.id === autoStaged.id &&
    set.weight === autoStaged.weight &&
    set.reps === autoStaged.reps
  ) {
    return false;
  }
  return true;
}
