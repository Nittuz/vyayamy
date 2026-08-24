/**
 * One-shot handoff bridging creation-time set seeding (repeatLastWorkout,
 * startPlannedWorkout — raw transactions that run with no screen mounted) to
 * useWorkoutCursor's per-mount stagedMarkers map (the only staged-set
 * provenance WorkoutActive.tsx has, for #12 nag suppression + the LAST TIME
 * strip).
 *
 * The creation mutation stashes its seeded-set descriptors here, keyed by the
 * new workout id, BEFORE navigating. WorkoutActive's cursor hook takes them
 * once its workoutId is known and adopts each into its own map. "Take"
 * deletes the entry — a later mount of the SAME workout (app relaunch, tab
 * switch away and back after the handoff already fired) finds nothing and
 * falls back to today's safe over-warn behavior (shouldConfirmLeavingSet /
 * countDiscardableSets treat an unmarked valued set as user intent), never a
 * stale replay onto a workout the user has since edited.
 */
import type { AutoStagedSet } from '@/components/activeSet';

const pending = new Map<string, AutoStagedSet[]>();

/** Stash this workout's seeded-set markers for the next mount to adopt. A
 * later stash for the same workout id replaces whatever was stashed before. */
export function stashSeedMarkers(workoutId: string, markers: AutoStagedSet[]): void {
  pending.set(workoutId, markers);
}

/** Take (and clear) the markers stashed for this workout id. Unknown id, or
 * an id already taken once, returns null — never re-delivers the same batch. */
export function takeSeedMarkers(workoutId: string): AutoStagedSet[] | null {
  const markers = pending.get(workoutId);
  if (markers === undefined) return null;
  pending.delete(workoutId);
  return markers;
}
