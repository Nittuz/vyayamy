export const queryKeys = {
  workouts: {
    all: ['workouts'] as const,
    active: (userId: string) => ['workouts', 'active', userId] as const,
    recent: (userId: string) => ['workouts', 'recent', userId] as const,
    withExercises: (workoutId: string) => ['workouts', 'detail', workoutId] as const,
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
    // Heaviest-weight history is derived from sets, so it lives under the sets
    // root — that way `syncInvalidationRoots` (['sets']) catches it after pull.
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
