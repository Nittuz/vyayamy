export const queryKeys = {
  workouts: {
    all: ['workouts'] as const,
    active: (userId: string) => ['workouts', 'active', userId] as const,
    recent: (userId: string) => ['workouts', 'recent', userId] as const,
    withExercises: (workoutId: string) => ['workouts', 'detail', workoutId] as const,
  },
  exercises: {
    all: ['exercises'] as const,
    search: (q: string) => ['exercises', 'search', q] as const,
    recent: (userId: string) => ['exercises', 'recent', userId] as const,
  },
  sets: {
    byWorkoutExercise: (weId: string) => ['sets', weId] as const,
  },
  profile: (userId: string) => ['profile', userId] as const,
  personalRecords: (userId: string) => ['personal_records', userId] as const,
  templates: (userId: string) => ['templates', userId] as const,
  history: (userId: string) => ['history', userId] as const,
  plans: {
    active: (userId: string) => ['plans', 'active', userId] as const,
  },
};
