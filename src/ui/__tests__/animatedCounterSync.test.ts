/**
 * Live-QA finding: the session VOLUME tally (SessionVolumeBar, SessionRecap)
 * renders stale/zero. Root cause — the on-screen digits are painted by a
 * Reanimated worklet (`useAnimatedProps`) that writes the native text
 * directly, bypassing React's render cycle entirely; when that native write
 * doesn't land (observed on-device: a fresh mount racing a burst of
 * complete/delete/undo set writes), the label freezes at whatever it last
 * painted — 0 on a bare mount, or a pre-delete total after a delete — and
 * NOTHING in the worklet-only path ever corrects it, even though `volume`
 * itself (and every plain-React readout: SETS, ghost rows, History) keeps
 * updating correctly the whole time.
 *
 * `settledCounterText` is the fix's pure core: a guaranteed, plain-React
 * fallback for the settled digits, independent of whether the worklet's own
 * paint actually landed.
 */
import { formatCounterText, settledCounterText } from '../animatedCounterSync';

describe('formatCounterText', () => {
  test("rounds to the nearest integer string, matching the worklet's own Math.round", () => {
    expect(formatCounterText(157.5)).toBe('158');
    expect(formatCounterText(0)).toBe('0');
    expect(formatCounterText(99.4)).toBe('99');
  });

  test('negative-zero rounds to a plain "0", never "-0"', () => {
    expect(formatCounterText(-0)).toBe('0');
  });
});

describe('settledCounterText', () => {
  test('a finished animation settles the label on the rounded target', () => {
    expect(settledCounterText(true, 157.5)).toBe('158');
    expect(settledCounterText(true, 0)).toBe('0');
  });

  test('an interrupted animation (finished: false) must NOT settle the label', () => {
    // withTiming reports finished:false when a newer volume superseded this
    // run mid-flight (e.g. a rapid delete right after a LOG SET) — settling
    // on THIS call's target would paint a value that's already stale by the
    // time the callback fires.
    expect(settledCounterText(false, 157.5)).toBeNull();
  });

  test('an unconfirmed finish (finished: undefined) is treated the same as false', () => {
    // Reanimated types the callback's first argument `boolean | undefined` —
    // without a confirmed finish, settling still isn't safe.
    expect(settledCounterText(undefined, 157.5)).toBeNull();
  });
});
