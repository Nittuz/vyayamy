/**
 * Pure toast-lifecycle logic, split out of ToastContext.tsx so it is
 * unit-testable without a react-native/reanimated runtime.
 *
 * ToastContext.tsx pulls in Animated.View, useAnimatedStyle/useSharedValue,
 * useColorScheme (via useTheme), and AccessibilityInfo (via useReduceMotion);
 * reanimated 4 also needs its worklets Babel plugin, which only runs under
 * Metro, not ts-jest (see babel.config.js). jest.setup.js mocks 'react-native'
 * down to `{ Platform }` for the node/ts-jest harness this repo's tests run
 * under, and every existing @testing-library/react-native test in this repo
 * (authError.test.tsx, useMagicLinkHandler.test.ts, useVoiceSession.test.ts,
 * useReduceMotion.test.ts) sticks to renderHook — none renders an actual View/
 * Text/Pressable tree. Building a bespoke 'react-native' + reanimated mock
 * just for this component would be a first-of-its-kind, unmaintained shortcut
 * rather than a clean fit for the harness, so — per the task's own judgment
 * clause — the decision logic below is extracted and TDD'd directly instead
 * of rendering ToastProvider.
 */
import { darkPalette, lightPalette } from './colors';
import { motion } from './motion';

/** Hold duration absent an explicit `holdMs` opt — unchanged from before the action slot. */
export const TOAST_HOLD_MS = 2200;

/**
 * Hold duration for the two delete-undo toasts (undo spec §2/§3) — long
 * enough for a deliberate second look before the window closes. Both undo
 * call sites (EditSetSheet, HistoryDetail) MUST pass this explicitly as
 * `holdMs`; it is not applied automatically just because `onAction` is set.
 */
export const UNDO_HOLD_MS = 10_000;

export interface ToastTimingOpts {
  holdMs?: number;
}

export interface ToastTiming {
  /** Fade-in duration, ms. */
  inMs: number;
  /** Fully-visible hold duration, ms — `opts.holdMs` when given, else TOAST_HOLD_MS. */
  holdMs: number;
  /** Fade-out duration, ms. */
  outMs: number;
}

/**
 * Resolves the three `withSequence` durations for a toast's auto lifecycle.
 * Reduce Motion zeroes only the two fades (the existing rule, unchanged) —
 * the hold is readable time, not motion, so it is never zeroed even when
 * `opts.holdMs` is left unset.
 */
export function resolveToastTiming(
  opts: ToastTimingOpts | undefined,
  reduceMotion: boolean,
): ToastTiming {
  return {
    inMs: reduceMotion ? 0 : motion.duration.fast,
    holdMs: opts?.holdMs ?? TOAST_HOLD_MS,
    outMs: reduceMotion ? 0 : motion.duration.base,
  };
}

/**
 * Guards a toast's action button against firing `onAction` more than once —
 * a double-tap during the fast-dismiss window must still run it exactly
 * once. `latch` is a plain mutable ref-shaped box (a real `useRef` in the
 * component, a plain object in tests). Keying by the toast's own id (rather
 * than a bare boolean) means a fresh toast always gets a fresh attempt, even
 * if a stale tap somehow lands after the toast it belonged to was replaced.
 */
export function attemptActionLatch(latch: { current: number | null }, id: number): boolean {
  if (latch.current === id) return false;
  latch.current = id;
  return true;
}

/**
 * The toast pill's fill is `theme.color.ink` — deliberately self-inverted
 * relative to the app's own scheme (dark scheme renders a near-white pill,
 * light scheme a near-black one; see ToastContext.tsx's "Inverted pill"
 * comment). `theme.color.accent` is tuned for THIS scheme's normal,
 * non-inverted surfaces, so it fails badly on the pill: volt-on-near-white
 * (dark scheme) measures ~1.02:1 and dark-olive-on-near-black (light scheme)
 * measures ~2.86:1 — both far under the 4.5:1 body-text floor this repo's
 * contrast.test.ts holds every other ink/bg pair to (see this file's own
 * test for the numbers). The OPPOSITE palette's accent is the one actually
 * tuned for a surface this light/dark, which is exactly colors.ts's existing
 * rule that volt "appears in light mode only inside inverted black panels" —
 * this just applies that rule the one place a toast needs it.
 *
 * This resolves against the pill's NORMAL (`kind: 'info'`/`'success'`) fill
 * only. No caller currently pairs an action with `kind: 'error'` (the danger
 * fill), so the resulting accent-on-danger combination is latent and
 * untested — worth a contrast check here if an error+action toast ever ships.
 */
export function resolveToastActionAccent(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? lightPalette.accent : darkPalette.accent;
}

/**
 * VoiceOver/TalkBack label for the action button. A bare `actionLabel`
 * ("Undo") is ambiguous under rotor navigation once more than one toast
 * shape exists in the app ("Set deleted" vs "Workout deleted" both show an
 * "Undo" button) — the label needs to carry which toast it belongs to, the
 * same way this repo's other accessibilityLabels fold in their subject
 * rather than staying generic (e.g. HistoryDetail's `Edit set ${idx + 1},
 * ${exercise.name}`, EditSetSheet's `Delete set ${setNumber}`).
 */
export function actionAccessibilityLabel(actionLabel: string, message: string): string {
  return `${actionLabel}: ${message}`;
}
