/**
 * Product analytics event definitions and measurement vocabulary.
 *
 * This file establishes the canonical set of product events and metrics
 * before a concrete analytics provider (PostHog, Plausible, etc.) is chosen.
 * The `track()` function logs to console in dev and can be wired to a real
 * provider later without changing call sites.
 */

export type AnalyticsEvent =
  | { name: 'workout_started'; properties: { source: 'plan' | 'template' | 'repeat' | 'custom' } }
  | { name: 'workout_completed'; properties: { duration_s: number; exercise_count: number; set_count: number } }
  | { name: 'workout_discarded' }
  | { name: 'exercise_added'; properties: { source: 'search' | 'recent' | 'template' } }
  | { name: 'set_logged' }
  | { name: 'pr_achieved'; properties: { type: string } }
  | { name: 'template_created' }
  | { name: 'template_deleted' }
  | { name: 'plan_created'; properties: { plan_type: 'weekly' | 'cycle' } }
  | { name: 'plan_deleted' }
  | { name: 'profile_updated'; properties: { field: string } }
  | { name: 'export_downloaded'; properties: { format: 'json' | 'csv' } }
  | { name: 'feedback_sent' }
  | { name: 'onboarding_dismissed' }
  | { name: 'starter_template_used'; properties: { preset_id: string } };

/**
 * Track a product event. Logs to console in development; wire to a real
 * provider (PostHog, Plausible, etc.) when ready for production analytics.
 */
export function track(event: AnalyticsEvent): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', event.name, 'properties' in event ? event.properties : '');
  }
  // TODO(phase-8): Wire to analytics provider here
}

/**
 * Core product metrics — what we want to measure and why.
 *
 * These are not computed here; they document the measurement plan
 * so the team has a shared vocabulary before instrumentation begins.
 */
export const METRICS = {
  weeklyActiveWorkouts: {
    description: 'Number of completed workouts per user per week',
    why: 'Core engagement signal — are people training consistently?',
  },
  workoutCompletionRate: {
    description: 'Ratio of completed workouts to started workouts',
    why: 'Measures whether the active-workout UX supports finishing',
  },
  avgWorkoutDuration: {
    description: 'Mean time between workout start and finish',
    why: 'Signals session depth; unusually long may indicate abandoned sessions',
  },
  templateAdoption: {
    description: 'Percentage of workouts started from a template vs custom',
    why: 'Indicates whether the template system adds value',
  },
  planAdherence: {
    description: 'Percentage of planned slots completed on schedule',
    why: 'Measures whether the training plan drives behavior',
  },
  prFrequency: {
    description: 'Personal records achieved per user per week',
    why: 'Progress signal — users who see PRs stay engaged',
  },
  betaFeedbackRate: {
    description: 'Number of feedback events per active user',
    why: 'Measures whether the feedback path is discoverable and used',
  },
  starterTemplateConversion: {
    description: 'Percentage of new users who use a starter template preset',
    why: 'Measures whether quick-start presets reduce onboarding friction',
  },
} as const;
