export const queryKeys = {
  workouts: {
    all: ['workouts'] as const,
    active: (userId: string) => ['workouts', 'active', userId] as const,
    recent: (userId: string) => ['workouts', 'recent', userId] as const,
    withExercises: (workoutId: string) => ['workouts', 'detail', workoutId] as const,
    // Prefix matching every mounted workout-detail query, regardless of id.
    // Invalidating this refreshes WorkoutActive/HistoryDetail without needing
    // the workout id threaded through every set mutation's call site.
    detailRoot: ['workouts', 'detail'] as const,
  },
  exercises: {
    all: ['exercises'] as const,
    // Search includes userId so two accounts on the same device do not collide
    // (the underlying SQL filters by user_id and global rows).
    search: (userId: string, q: string) => ['exercises', 'search', userId, q] as const,
    recent: (userId: string) => ['exercises', 'recent', userId] as const,
  },
  sets: {
    byWorkoutExercise: (weId: string) => ['sets', weId] as const,
    // Chart history (heaviest-weight AND best-set-volume series — Progress
    // appends the metric to this key) is derived from sets, so it lives under
    // the sets root — that way `syncInvalidationRoots` (['sets']) catches it
    // after pull.
    weightHistory: (userId: string, exerciseId: string) =>
      ['sets', 'weight-history', userId, exerciseId] as const,
  },
  profile: (userId: string) => ['profile', userId] as const,
  personalRecords: (userId: string) => ['personal_records', userId] as const,
  templates: (userId: string) => ['templates', userId] as const,
  history: (userId: string) => ['history', userId] as const,
  plans: {
    active: (userId: string) => ['plans', 'active', userId] as const,
  },
  planPresets: {
    list: () => ['plan_presets', 'list'] as const,
  },
};

/**
 * Query keys a set write must invalidate so local readers refresh WITHOUT a
 * network round-trip (deep-review #11). A set write changes both the
 * per-workout-exercise list AND the composite workout-detail query that
 * WorkoutActive/HistoryDetail actually render from; invalidating only the
 * former left the active screen frozen offline until a sync push happened to
 * land. Keep this the single source of truth for set-write invalidation.
 */
export function setWriteInvalidationKeys(weId: string): readonly (readonly string[])[] {
  return [queryKeys.sets.byWorkoutExercise(weId), queryKeys.workouts.detailRoot];
}

/** Prefixes matching React Query keys for domains touched by sync (see SYNCED_TABLES). */
export const syncInvalidationRoots = [
  ['profile'],
  ['exercises'],
  ['workouts'],
  ['sets'],
  ['personal_records'],
  ['templates'],
  ['plans'],
  ['plan_presets'],
  ['history'],
] as const;
