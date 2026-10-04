# Voice set logging: from spoken set to refreshed card

- **Status:** approved
- **Date:** 2026-10-04
- **Related ADRs:** none

## Problem

Through TestFlight builds 10 to 13 the owner reported the same thing in four
wordings: the app shows it hears the words, but the set never changes. Each build
patched one visible symptom (permissions, late finals, tap/hold state, grammar,
the pending question). Build 13 still failed, and the owner asked for a design
from evidence rather than another patch.

The evidence came from a voice diagnostics log (build 13 branch, `src/voice/voiceLog.ts`,
viewable from the workout screen) driven on the simulator with the Mac microphone
and `say`. Two independent defects were found, and either one alone produces the
report:

1. **The recognizer rewrites numbers after they were right.** For spoken
   "two twenty five for five" the partial stream read `225`, `225 for`,
   `225 for five`, then Apple's number formatter fused it into `220 545`. The
   final carried `220 545` and every N-best alternative carried a fused form
   too (`22 545`, `220 5 for five`). Nothing parsed, so nothing was dispatched.
   The same formatter wrote "two forty by eight" as the dimension `2 40 x 8`
   and "seven reps at two fifty" as the clock time `Seven reps at 2:50` (with
   `Seven reps of 250` as the alternative): the connector survived, but the
   weight arrived as digit groups, a time, or behind a connector the grammar
   did not know.
2. **A dispatched set never reached the screen.** When a final did parse
   (release before the rewrite: final `255 for four`), the log showed
   `dispatch.result ok "255 × 4"` and the database held 255 × 4, but the card
   kept rendering the previous values. Voice writes go through
   `dispatchCommand` → `updateSet`, which bypasses the `useUpdateSet` mutation
   wrapper that invalidates React Query. The card re-rendered only on a later
   unrelated invalidation, and a LOG SET tap in between wrote the stale
   on-screen values back over the spoken ones. This is the defect that made
   every earlier recognition fix look like it had done nothing.

## Goals & non-goals

- Goal: a set spoken in the documented forms lands on the card within the same
  session, whether the recognizer's final arrives in word form, fused form, or
  not at all.
- Goal: every voice data write refreshes the screen the same way a keypad write
  does, including undo.
- Goal: the diagnostics log stays in the product so the next report comes with
  evidence.
- Non-goal: a custom number recognizer or on-device model.
- Non-goal: new grammar phrasings beyond those already in the help sheet.

## Design

Pipeline, in the order events arrive in `useVoiceSession`:

1. **Partials** update the card's live transcript and feed
   `BestPartialTracker` (`src/voice/bestPartial.ts`), which remembers the latest
   partial that parsed as a complete, high-confidence set (weight and reps).
   Bare numbers, half sets, and control words in partials are ignored. A
   remembered partial is discarded at the final if its weight is a proper digit
   prefix of a number in any final hypothesis: "seven reps at two fifty"
   streamed `Seven reps at two`, a complete-looking 2 × 7, before the number
   finished. Only the weight is checked; a reps check would also match the
   fused `545` of the case the tracker exists for.
2. **Split weights are re-joined** inside the grammar (`joinSplitDigits` in
   `src/voice/grammar.ts`), on the weight side of a connector or of "reps at"
   only: a single digit followed by a two-digit group is a hundreds-elided
   number (`2 40` → 240), and a round number followed by a single digit is its
   tail (`220 5` → 225). A clock time between digits (`2:50`) is split back
   into groups first, and "reps of" joins "reps at" as a reps-first connector.
   Fused groups such as `220 545` are left alone and fail to parse rather than
   guess. A transcript with the connector dropped (`225 five`, confidence
   0.12 in the log) is never glued into a weight; it parses as a full set at
   low confidence, so the question the user already gets carries both numbers
   and "yes" logs the set instead of only the weight.
3. **Final** (with its N-best alternatives, or the end-of-session promotion of
   the last partial) goes to `pickBestParse` (`src/voice/alternatives.ts`). The
   final is authoritative when its top hypothesis is a control word ("yes",
   "undo", "done") or when any hypothesis is a complete set. Otherwise the
   remembered partial wins over a fused or half-parsed final. The log records
   which source was used. The tracker resets on every start and after every
   final, so a remembered set can never leak into a later session.
4. **Dispatch** is unchanged (`dispatchCommand` → SQLite + outbox). On success,
   and after an undo, the hook calls the new `onDataChanged` dependency.
   `WorkoutActive` wires it to the same `setWriteInvalidationKeys` the keypad
   path uses, so the composite detail query and the set list refetch and the
   card, LOG SET label, and volume bar update.

Nothing changes in the grammar, the engine, the mic button, or the pending
"say yes" flow.

## Alternatives considered

- **Un-fuse a fused group in the parser** (`545` → "5 for 5"): rejected. The
  rewrite is lossy (`220 545` cannot be told from 220 × 545). Only the two
  split shapes above are repaired, because each has exactly one reading when
  it sits on the weight side of a connector; everything else falls back to the
  partial stream, which carries the user's actual utterance.
- **Invalidate inside `dispatchCommand`**: rejected. Dispatch is a pure data
  layer with no query client; the screen owns its readers, as it does for the
  direct `addSet` path.
- **Optimistic cache patch for voice**: not needed. The invalidate-then-refetch
  round trip is one SQLite read and the card re-mounts per set anyway.

## Testing

- Unit: `grammar.setvalues.test.ts` (split weights `2 40 x 8`, `220 5 for
five`, `2 20 5 for 5`, `8 reps at 2 40`, clock time `7 reps at 2:50`,
  `seven reps of 250`; `225 five` asks with both numbers; fused groups stay
  unparsed);
  `bestPartial.test.ts` (keeps the latest complete set, ignores half sets,
  resets, truncation guard); `useVoiceSession.test.ts` (fused final falls back
  to the remembered partial; memory is per session; `onDataChanged` fires on
  success and undo, not on failure; a truncated partial never beats the
  final); existing `alternatives`, `grammar`, `lateFinal`
  suites unchanged.
- Simulator loop (Release build, Mac mic as input, `say -v Samantha -r 150`
  with a 3 s head start under a 9 s hold): "two twenty five for five",
  "two thirty five for eight", "two forty five for six", "two fifty five for
  four", "two forty by eight", "seven reps at two fifty". Pass is the card
  showing the spoken set without a relaunch.
- Device: TestFlight build 14; the Voice log is shareable from the workout
  screen if it fails.

## Rollout

Ships as TestFlight build 14 on the current branch. No data or backend change.

## Open questions

None.
