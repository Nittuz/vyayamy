/**
 * Display-sync guard for the animated volume counters (SessionVolumeBar,
 * SessionRecap) — live-QA finding: the session VOLUME tally renders
 * stale/zero while SETS, ghost rows, and History (all plain React reads of
 * the same `exercises` data) stay correct throughout.
 *
 * The counters' digits are painted by a Reanimated worklet
 * (`useAnimatedProps` writing a native "text" prop) that runs on the UI
 * thread, entirely bypassing React's render cycle — that's what lets the
 * count-up animate without re-rendering the JS tree. When that native write
 * doesn't land — observed on-device with a rapid complete/delete/undo
 * burst — the label freezes at whatever it last painted (0 on a bare mount,
 * or a pre-delete total after a delete) and nothing in the worklet-only path
 * ever corrects it, because the worklet is the ONLY thing driving the
 * on-screen text; `volume` itself keeps updating correctly the entire time
 * (confirmed: SETS and ghost rows, driven by ordinary React children, never
 * go wrong).
 *
 * The fix is a safety net, not a replacement: keep the worklet's smooth
 * count-up when it works, but ALSO settle the label through a plain React
 * string once the animation genuinely finishes, so the digits can never get
 * permanently stuck even if the native paint silently no-ops. Kept free of
 * react-native / reanimated imports so it runs under the node test harness,
 * matching completeSetChoreography.ts's split (decision logic here, wiring
 * in the component).
 */

/**
 * `157.5 -> "158"` — the exact text both the worklet and the settle fallback
 * render.
 *
 * Called from the UI thread (by `settledCounterText`, itself called from a
 * `withTiming` completion callback) as well as from plain JS (the
 * components' initial `useState`) — the `'worklet'` directive is load-
 * bearing for the former: without it, Metro/Babel doesn't bundle this
 * function for the UI runtime, and calling it from worklet context throws
 * `[Worklets] Tried to synchronously call a non-worklet function` at
 * runtime (live-QA regression, SessionRecap.tsx). A worklet-marked function
 * is still perfectly callable from JS thread — the directive only ADDS UI-
 * thread capability, so this stays correct either way. `ts-jest` compiles
 * this file with plain tsc (no Babel, no worklets plugin), so the directive
 * is an inert string literal under Jest — node tests cannot verify this
 * requirement at all; it only matters, and only fails, on-device.
 */
export function formatCounterText(volume: number): string {
  'worklet';
  // `Math.round` alone can hand back a `-0` for tiny negative inputs, which
  // template-literal-stringifies to "-0" — never a real volume, but worth
  // killing at the source so the label is never surprising.
  return `${Math.round(volume) || 0}`;
}

/**
 * What the settled (plain-React) label should become once one count-up run
 * resolves — `null` means "leave the label alone."
 *
 * `finished` must come straight from withTiming's own completion callback
 * (typed `boolean | undefined` by Reanimated itself): an interrupted run (a
 * newer `volume` superseding this one mid-flight, e.g. a rapid delete right
 * after a LOG SET) reports `finished: false`, and settling on THIS call's
 * target would paint a value that's already stale by the time the callback
 * fires — the newer run's own completion (or lack thereof) owns the label
 * from that point on. `undefined` is treated the same as `false`: without a
 * confirmed finish, settling is not safe.
 *
 * Called directly inside a `withTiming` completion callback, i.e. on the UI
 * thread — the `'worklet'` directive is load-bearing (see formatCounterText
 * above); node tests cannot verify it, only on-device runs can.
 */
export function settledCounterText(
  finished: boolean | undefined,
  targetVolume: number,
): string | null {
  'worklet';
  return finished ? formatCounterText(targetVolume) : null;
}
