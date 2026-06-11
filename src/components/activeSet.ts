/**
 * Pure state-machine helpers for the Active-Set card flow.
 * Given the workout's exercises and the current cursor (which set is
 * being lifted), compute the next cursor on completion. Returns null
 * when the workout is finished (last set of last exercise).
 */

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

export interface ActiveCursor {
  weId: string;
  setId: string;
}

export function advanceCursor(
  exercises: ExerciseShape[],
  cursor: ActiveCursor,
): ActiveCursor | null {
  const exIdx = exercises.findIndex((e) => e.id === cursor.weId);
  if (exIdx === -1) return null;
  const ex = exercises[exIdx]!;
  const setIdx = ex.sets.findIndex((s) => s.id === cursor.setId);
  if (setIdx === -1) return null;

  // Try next set in same exercise
  if (setIdx + 1 < ex.sets.length) {
    return { weId: ex.id, setId: ex.sets[setIdx + 1]!.id };
  }

  // Try first set of any subsequent exercise that has sets
  for (let i = exIdx + 1; i < exercises.length; i++) {
    const nextEx = exercises[i]!;
    if (nextEx.sets.length > 0) {
      return { weId: nextEx.id, setId: nextEx.sets[0]!.id };
    }
  }

  // No more sets — finish workout
  return null;
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
