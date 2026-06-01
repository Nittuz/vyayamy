/**
 * Pure planner for the signature complete-set moment.
 *
 * Kept free of react-native / reanimated imports so it runs under the node test
 * harness. `useCompleteSetAnimation` consumes this to drive the actual animation;
 * the decision logic (what fires, and whether reduced-motion suppresses it) lives
 * here and is unit-tested.
 */
import { duration } from './motion';

export interface Choreography {
  /** Spring-scale the check mark. */
  animateCheck: boolean;
  /** Bloom the accent glow once. */
  glow: boolean;
  /** Volume count-up duration in ms (0 = jump straight to the new value). */
  tallyMs: number;
  /** Which haptic to fire. PR wins over last-set/mid-set. */
  haptic: 'light' | 'medium' | 'success';
  /** Show the PR pill (state, not motion — shown even under reduced motion). */
  showPRPill: boolean;
}

export function computeChoreography(o: {
  reduceMotion: boolean;
  isPR: boolean;
  lastSet?: boolean;
}): Choreography {
  return {
    animateCheck: !o.reduceMotion,
    glow: !o.reduceMotion,
    tallyMs: o.reduceMotion ? 0 : duration.counter,
    haptic: o.isPR ? 'success' : 'medium',
    showPRPill: o.isPR,
  };
}
