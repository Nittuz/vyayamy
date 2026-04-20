/**
 * Starter template presets for common training structures.
 *
 * These reference global exercises by name (matched at runtime)
 * and let new users bootstrap templates without manual setup.
 */

export type StarterPreset = {
  id: string;
  label: string;
  description: string;
  templates: { name: string; exerciseNames: string[] }[];
};

export const STARTER_PRESETS: StarterPreset[] = [
  {
    id: 'ppl',
    label: 'Push / Pull / Legs',
    description: '3-day split — chest & shoulders, back & biceps, legs',
    templates: [
      { name: 'Push', exerciseNames: ['Bench Press', 'Overhead Press', 'Incline Bench Press', 'Tricep Pushdown'] },
      { name: 'Pull', exerciseNames: ['Barbell Row', 'Pull-up', 'Lat Pulldown', 'Dumbbell Curl'] },
      { name: 'Legs', exerciseNames: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Lunges'] },
    ],
  },
  {
    id: 'upper-lower',
    label: 'Upper / Lower',
    description: '2-day split — all upper body, then all lower body',
    templates: [
      { name: 'Upper Body', exerciseNames: ['Bench Press', 'Barbell Row', 'Overhead Press', 'Dumbbell Curl', 'Tricep Pushdown'] },
      { name: 'Lower Body', exerciseNames: ['Squat', 'Deadlift', 'Romanian Deadlift', 'Leg Press', 'Lunges'] },
    ],
  },
  {
    id: 'full-body',
    label: 'Full Body',
    description: 'One session covering all major muscle groups',
    templates: [
      { name: 'Full Body', exerciseNames: ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'] },
    ],
  },
];

/**
 * Resolve exercise names to IDs from a global exercise list.
 * Returns only names that matched — missing exercises are silently skipped.
 */
export function resolveExerciseIds(
  exerciseNames: string[],
  globalExercises: { id: string; name: string }[],
): string[] {
  const nameToId = new Map(globalExercises.map((e) => [e.name.toLowerCase(), e.id]));
  return exerciseNames
    .map((n) => nameToId.get(n.toLowerCase()))
    .filter((id): id is string => id != null);
}
