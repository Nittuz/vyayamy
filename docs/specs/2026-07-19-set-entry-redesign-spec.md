# Set-entry redesign — never-empty logging (approved 2026-07-19)

- **Status:** approved
- **Date:** 2026-07-19
- **Related ADRs:** none
- **Sources:** 17-agent multi-lens review of the set-entry flow (2026-07-18): code-level interaction audit, first-principles critique, constitution/backlog alignment, competitive research, design-history reconstruction. 12 code defects confirmed with file:line evidence, 0 refuted.

## Problem

Entering a set — the app's core verb, performed 15–25× per workout — is fiddly and lossy. The user-facing symptom ("a hyphen sits in the field, and it stays / comes back even after tapping in") decomposes into three verified mechanisms plus structural friction:

1. **Wipe-on-blur (critical).** The keypad's debounce buffer starts empty and is fed only by keystrokes; blur always commits the buffer, and an empty buffer means "clear". Opening the keypad on a filled field and dismissing without typing silently erases the value to `-` (`src/components/numericStepper.ts:95`, `NumericStepperView.tsx:107/154`). A stale-buffer variant re-commits an old number over newer (incl. voice-written) values.
2. **Mid-typing commits race every consumer (critical).** Keystrokes commit to SQLite + the sync outbox after any 250ms pause, and every unmount path (swipe-complete, voice `done`, bottom-bar Next — which sits outside the ScrollView so the keyboard does not swallow its tap) discards un-flushed keystrokes. Typing `12`, pausing after `1`, and swiping banks `60×1` (`numericStepper.ts:110/131-135`, `WorkoutActive.tsx:436/488-498`).
3. **The dash is not an affordance.** `formatValue(null) → '-'` renders empty editable fields identically to real values and to the "no data" glyph in read-only strips (`numericStepper.ts:40`). In edit mode the TextInput has no placeholder, no `minWidth`, no `selectTextOnFocus`: an empty field collapses to a bare caret (the sibling's `-` still on screen), and a filled field seeds old text that must be manually backspaced.

Confirmed alongside: lb users cannot type fractional weights (keyboardType derived from step integer-ness), locale `62,5` silently discarded, voice `done` completes empty sets, the stepper's `onBlur` prop is dead (focus never clears), chevrons stay live under the open keypad, EditSetSheet's Save races the debounce, Android submit+blur double-commits, iOS number-pad has no exit key, and `keyboardShouldPersistTaps` default swallows every field-handoff tap.

Structurally: the first set of each exercise starts `- × -` despite full local history (~10 touches for the costliest case); the thumb-zone CTA is spent on once-per-exercise navigation while logging has no button; bodyweight sets cannot be completed at all (`canComplete` demands weight).

Competitive baseline (Strong, Hevy, Fitbod, Boostcamp, HeavySet): an empty weight/reps field effectively does not exist in this category — sets are ghost-prefilled from the previous session and one gesture accepts them.

## Goals & non-goals

- Goal: what the user sees is what gets saved — one commit per edit session, no mid-typing writes, no silent wipes.
- Goal: a set field is never a bare `-`; first sets prefill from history with provenance; repeating last week's set costs one tap.
- Goal: logging a set gets the thumb-zone button; swipe-up stays the signature power gesture.
- Goal: bodyweight (weightless) sets are loggable and explicit.
- Goal: close the open backlog items that live in the files being rewritten (9.3/#27 chevron targets, 7.5/#30 icon glyphs, 9.2/#117 Dynamic Type, 7.1/7.2 Text primitive + makeStyles, 2.2/#137 voice clamp).
- Non-goal: custom in-app keypad (future direction C), plate calculator, progression suggestions, RPE/warm-up set types, tap-to-decrement reps, rep-based PRs.

## Design

### 1. Commit lifecycle — one edit session, one write

Replace the debounce-buffer architecture in `numericStepper.ts` / `NumericStepperView.tsx`:

- While the keypad is open, keystrokes update local `editingText` only. Nothing reaches SQLite mid-typing.
- The edit commits **exactly once**, parsed from the on-screen `editingText`, when the session ends: TextInput blur, accessory-bar **DONE**/**NEXT**, or a consumer flush (see §3). Commit is idempotent (guards the Android submit+blur double-fire).
- An untouched session is a no-op: if `editingText` still equals the seeded text, no write happens. Deliberately clearing the text commits `null`.
- `selectTextOnFocus` on the TextInput (typing overwrites); ghosted placeholder + one-tabular-digit `minWidth` (the slot can never collapse to a caret); chevrons hidden while the keypad is open.
- iOS `InputAccessoryView` above the keyboard: **NEXT** on the weight field (commit + move to reps), **DONE** on reps (commit + dismiss). This is the missing keypad exit.
- Keyboard: weight always `decimal-pad` (regardless of step — lb users type 2.5); reps `number-pad`. Parsing accepts `,` as a decimal separator.
- The stepper's `onBlur` prop is actually called on session end so the parent focus state clears (today it is dead code).
- The WorkoutActive ScrollView sets `keyboardShouldPersistTaps="handled"` so field-handoff taps land on the first try.
- Pending-edit flush is exposed to the parent (ref-based `flushPendingEdit(): void` on the stepper) so every consumer in §3 can commit synchronously before reading values.

**Deliberate reversal** of the 250ms-autosave decision (#50, commit `124a816`): the crash-mid-edit exposure is one field of retypable digits; the autosave was buying five confirmed defects (wipe-on-blur, stale buffer, partial-value banking, clamp-vs-display divergence, keystroke-discard on unmount). Sanitize (`sanitizeNumber`, #19) remains the single choke point in front of the one commit.

### 2. Never-empty prefill

- Staging the **first set of an exercise** (next-exercise advance in `useWorkoutCursor.ts:87`, picker add, workout start) queries local history: the most recent *completed* workout containing the same `exerciseId`. Seed = that session's same-index set, falling back to its top set. Weight converts via `convertWeight` to the current profile unit and rounds to the current step. New pure helper (e.g. `planFirstSet`) beside `planStagedSet` in `activeSet.ts`; the history lookup is a query-layer function with its own unit test.
- Seeded values are written into the staged set exactly like today's auto-stage carry-over, so `canComplete` arms immediately — repeat-of-last-week = one tap. The `shouldConfirmLeavingSet` untouched-seed comparison extends to these seeds (same `AutoStagedSet` mechanism), so navigation never nags about values the user didn't touch.
- Provenance: a mono strip under the hero row — `LAST TIME · 60 × 8` — rendered only when the seed came from history and the set is still untouched. Strip variant, `inkTertiary`, per the metadata conventions.
- No history (genuinely new exercise): values stay `null`; the field renders a **ghosted `0` (`inkTertiary`) above a 2px `borderStrong` underline** instead of `-`. The underline appears only in the empty state — it marks "input slot". First tap still opens the keypad directly (the `6e76688` invariant). The `-` glyph remains only in read-only contexts (ghost strips, history, voice echo) where it means "no data".
- Accessibility label for the empty state becomes "WEIGHT: empty. Tap to enter." (never announces a dash).

### 3. Commit hierarchy — logging gets the button

- Bottom bar (`WorkoutActive.tsx:488-498`) becomes: full-width **`LOG SET · 60 × 8`** in the inverted plate treatment (echoing current values is the confirmation; volt stays reserved) + a compact secondary **`next ›`** control. On the last set of the last exercise the slot swaps to the volt `Finish workout` CTA, as today.
- LOG SET runs the existing completion path unchanged: flush pending edit → gate check → `haptics.medium` → complete → volume tally / PR glow → auto-stage → rest-timer start.
- **Swipe-up stays** as the signature gesture, same thresholds and haptics. When the gate fails, the card gives a small rubber-band resistance (Reduce Motion: no movement) and the hint line states what is missing (`ENTER REPS`) instead of a dead gesture.
- Every completion/navigation consumer flushes the open edit first and then respects the same gate: LOG SET, swipe, **voice `done`** (today it bypasses the gate and completes empty sets — fixed), next-exercise, finish.
- `Next exercise` keeps the #12 leave-confirm semantics, evaluated on post-flush values.

### 4. Bodyweight sets

- `canComplete` becomes **reps required, weight optional**.
- A null-weight set renders as **`BW`** wherever a logged/loggable set is displayed: the LOG SET echo (`LOG SET · BW × 8`), ghost strips (`SET 1 · BW × 8`), history detail, voice echo. The button text makes "you are about to log bodyweight" explicit — no equipment schema needed; history prefill makes accidental BW on barbell lifts unlikely.
- Unit provenance: weightless sets keep `units: null` (existing #131 rule). `sumVolume` already skips them; weight-PR logic is unaffected (no weight, no weight PR). Verify `finishWorkout`'s dangling-set pruning keys on `completed`, not on value presence, so a banked BW set survives.

### 5. Propagation & kept invariants

- **EditSetSheet** inherits the new stepper wholesale; Save flushes any open edit before reading drafts (fixes the save race). Clearing weight there keeps its stored-unit behavior; the active card's clear-weight path aligns with it (`units: null` when weight is null — fixes the #131 inconsistency at `WorkoutActive.tsx:139`).
- **Stepper modernization in the same rewrite:** `Text` primitive + `makeStyles(theme)` (7.1/7.2), Icon-registry chevrons at ≥44pt targets (7.5/#30, 9.3/#27), Dynamic Type caps per the hero strategy (9.2/#117), Blacktop press feedback (60ms opacity dip + scale 0.985) on all entry pressables.
- **Voice** parsed numbers route through `sanitizeNumber` before dispatch (2.2/#137).
- Unchanged by contract: `sanitizeNumber` as the single choke point (weight 0–1500 decimal, reps 0–200 integer); `null` (never `0`) as the empty semantic; unit label always visible at hero size, never focus-dependent (#136); the haptic map (stepper=light, banked=medium, threshold=rigid) via `src/ui/haptics`; #14 ramp accumulator + bound guard; decimal hygiene (trailing-zero strip, FP-dust rounding); empty field → keypad on first tap (`6e76688`); value-aware a11y labels + the non-gesture `activate` completion action (#9.1); mutations via `useUpdateSet`/`useAddSet` so detail-query invalidation keeps the screen live offline (#11); volt reserved for PR/finish moments — LOG SET uses the **inverted** plate treatment (elevation, not volt; the finish-swap keeps volt), focus/selection uses inversion; no en-/em-dash glyphs anywhere.

## Alternatives considered

- **A — plumbing fixes only:** fixes the 12 defects but keeps `- × -` cold starts, the hidden-chevron model, and gesture-only commit. Rejected as under-serving the journal-first mission; its fixes are subsumed by §1.
- **C — custom in-app Blacktop keypad** (plate-math keys, BW key, DONE): strongest control and gym ergonomics, but the largest scope and unneeded until the system-keyboard flow (§1) proves insufficient. Deferred, not rejected.
- **Ghost-rendered (uncommitted) prefill** instead of writing seeds into the staged set: closer to Hevy's placeholder model, but it forks the staged-set semantics (`null` yet displayed, new confirm step) and breaks the one-tap repeat. Rejected — the `AutoStagedSet` comparison already distinguishes untouched seeds.

## Testing

- Pure logic (Jest, existing pattern): the commit-session state machine (seed → keystrokes → commit-once semantics, untouched no-op, clear-to-null, idempotent commit, comma parsing); `planFirstSet` resolution (index match, top-set fallback, unit conversion + step rounding, no-history null); the new `canComplete`; BW formatting.
- Characterization updates: `numericStepper.test.ts` (buffer-based tests replaced by session tests), `activeSetCursor.test.ts` (prefill staging), `shouldConfirmLeavingSet` with history seeds.
- Device QA checklist (rides the pending QA batch): keyboard-dismissal paths ×{untouched, typed, cleared}; NEXT/DONE accessory; type-then-swipe within 250ms; voice while keypad open; `62,5`; lb 2.5; BW log; offline logging; Reduce Motion rubber-band suppression; VoiceOver labels + activate action.

## Rollout

No schema or sync changes (all new values are already-representable states). Ships as one branch; the stepper rewrite and the prefill/bottom-bar work are separable commits. Sideloaded test build refresh after merge — note the tester device may predate `6e76688` and should be rebuilt regardless.

## Open questions

None at approval time.
