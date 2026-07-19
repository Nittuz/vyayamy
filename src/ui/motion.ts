/**
 * Motion tokens — spring configs for Reanimated and duration tokens for timing.
 *
 * Springs do NOT take a `duration`. The damping/stiffness pair fixes feel.
 * Perceptual durations are ~250–350ms depending on values.
 *
 * Blacktop motion language (dial 7, every entry reduced-motion-gated):
 *   - settleSlam: display type enters translateY slam.rise→0 with a slight
 *     overshoot, once per screen mount.
 *   - stagger: list rows fade/rise `stagger.rise`px on a `stagger.stepMs`
 *     cascade (History, Recent, PR list).
 *   - duration.inversionBlink: the 120ms chalk↔blacktop blink (PR volume bar).
 *   - duration.segmentSweep: the 150ms selection inversion sweep.
 *   - duration.press: the Plate press dip (opacity + scale).
 */

const spring = {
  snappy: { damping: 22, stiffness: 240 },
  settle: { damping: 22, stiffness: 200 },
  rebound: { damping: 18, stiffness: 280 },
  /** Display type slam-in: under-damped on purpose for a visible overshoot. */
  settleSlam: { damping: 14, stiffness: 340 },
} as const;

export const duration = {
  fast: 150,
  base: 220,
  slow: 320,
  counter: 600,
  /** One half-cycle of an attention pulse (sync-error stripe). */
  pulse: 500,
  /** Plate press dip in/out. */
  press: 60,
  /** Chalk↔blacktop inversion blink (volume-bar PR moment). */
  inversionBlink: 120,
  /** Segment/tab selection inversion sweep. */
  segmentSweep: 150,
} as const;

/** Display-type slam-in entrance (pairs with spring.settleSlam). */
const slam = {
  /** Headlines enter from this translateY. */
  rise: 12,
} as const;

/** List cascade: rows fade in while rising `rise`px, `stepMs` apart. */
const stagger = {
  rise: 8,
  stepMs: 40,
} as const;

/** Delay for the nth row of a staggered list cascade. */
export function staggerDelay(index: number): number {
  return index * stagger.stepMs;
}

export const motion = { spring, duration, slam, stagger };
export type Motion = typeof motion;
