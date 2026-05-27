/**
 * Motion tokens — spring configs for Reanimated and duration tokens for timing.
 *
 * Phase 1 uses motion in exactly three places (per spec):
 *   1. Set completion (snappy spring on lift, settle spring on next-set slide)
 *   2. Workout finish counter tally (timing)
 *   3. Exercise picker slide-up (settle spring)
 *
 * Springs do NOT take a `duration`. The damping/stiffness pair fixes feel.
 * Perceptual durations are ~250–350ms depending on values.
 */

export const spring = {
  snappy:  { damping: 22, stiffness: 240 },
  settle:  { damping: 22, stiffness: 200 },
  rebound: { damping: 18, stiffness: 280 },
} as const;

export const duration = {
  fast: 150,
  base: 220,
  slow: 320,
  counter: 600,
} as const;

export const motion = { spring, duration };
export type Motion = typeof motion;
