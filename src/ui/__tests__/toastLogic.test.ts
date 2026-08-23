/**
 * Pure toast decision logic (undo spec §2). ToastContext.tsx itself can't be
 * rendered under this repo's jest harness — see toastLogic.ts's file header
 * for the judgment call — so this pins the three extracted pieces: the
 * withSequence timing math, the action-button double-tap latch, and the
 * cross-palette accent used on the toast's self-inverted pill.
 */
import { darkPalette, lightPalette } from '@/ui/colors';
import { motion } from '@/ui/motion';
import {
  attemptActionLatch,
  resolveToastActionAccent,
  resolveToastTiming,
  TOAST_HOLD_MS,
} from '@/ui/toastLogic';

describe('resolveToastTiming', () => {
  test('no opts, motion allowed: default hold + real fade durations', () => {
    expect(resolveToastTiming(undefined, false)).toEqual({
      inMs: motion.duration.fast,
      holdMs: TOAST_HOLD_MS,
      outMs: motion.duration.base,
    });
  });

  test('no opts, reduce motion: both fades zeroed, hold left untouched', () => {
    expect(resolveToastTiming(undefined, true)).toEqual({
      inMs: 0,
      holdMs: TOAST_HOLD_MS,
      outMs: 0,
    });
  });

  test('an explicit holdMs overrides the default, independent of reduce motion', () => {
    expect(resolveToastTiming({ holdMs: 10_000 }, false).holdMs).toBe(10_000);
    expect(resolveToastTiming({ holdMs: 10_000 }, true).holdMs).toBe(10_000);
  });

  test('holdMs: 0 is honored, not treated as "unset" (?? not ||)', () => {
    expect(resolveToastTiming({ holdMs: 0 }, false).holdMs).toBe(0);
  });
});

describe('attemptActionLatch', () => {
  test('the first attempt for a toast id wins', () => {
    const latch = { current: null as number | null };
    expect(attemptActionLatch(latch, 1)).toBe(true);
    expect(latch.current).toBe(1);
  });

  test('a second attempt for the same id (double-tap during dismiss) loses', () => {
    const latch = { current: null as number | null };
    attemptActionLatch(latch, 1);
    expect(attemptActionLatch(latch, 1)).toBe(false);
    expect(attemptActionLatch(latch, 1)).toBe(false);
  });

  test('a fresh toast id always gets its own attempt, even over a stale latch', () => {
    const latch = { current: 1 as number | null };
    expect(attemptActionLatch(latch, 2)).toBe(true);
    expect(latch.current).toBe(2);
    // ...and now id 1 could fire again too, if it ever came back (it won't —
    // ids are monotonic — but the latch itself has no memory beyond "current").
    expect(attemptActionLatch(latch, 1)).toBe(true);
  });
});

describe('resolveToastActionAccent', () => {
  // WCAG relative luminance/contrast — mirrors contrast.test.ts's own local
  // copy (that file deliberately keeps this self-contained rather than
  // sharing a util, so this does too).
  function luminance(hex: string): number {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const adj = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * adj(r) + 0.7152 * adj(g) + 0.0722 * adj(b);
  }
  function contrast(a: string, b: string): number {
    const L1 = luminance(a);
    const L2 = luminance(b);
    const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (hi + 0.05) / (lo + 0.05);
  }
  const BODY_RATIO = 4.5;

  test('dark scheme: resolves to lightPalette.accent, readable on the (near-white) pill', () => {
    const accent = resolveToastActionAccent('dark');
    expect(accent).toBe(lightPalette.accent);
    expect(contrast(accent, darkPalette.ink)).toBeGreaterThanOrEqual(BODY_RATIO);
  });

  test('light scheme: resolves to darkPalette.accent, readable on the (near-black) pill', () => {
    const accent = resolveToastActionAccent('light');
    expect(accent).toBe(darkPalette.accent);
    expect(contrast(accent, lightPalette.ink)).toBeGreaterThanOrEqual(BODY_RATIO);
  });

  test('regression guard: the SAME-scheme accent would have failed on this surface', () => {
    // This is exactly why resolveToastActionAccent reaches for the opposite
    // palette instead of theme.color.accent — pin the failure so nobody
    // "simplifies" it back to the same-scheme accent later.
    expect(contrast(darkPalette.accent, darkPalette.ink)).toBeLessThan(BODY_RATIO);
    expect(contrast(lightPalette.accent, lightPalette.ink)).toBeLessThan(BODY_RATIO);
  });
});
