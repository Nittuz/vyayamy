# Voice Workout Logging — Design

**Date:** 2026-05-31
**Status:** Approved (brainstorm) → ready for implementation plan
**Feature:** Hands-free voice control for logging and running a workout in Vyayamy.

## Problem & goal

Gym-goers are mid-lift with chalky hands; tapping a phone between/under sets is
friction. Let a user **run an entire workout by voice** — log sets, complete
them, add exercises, control the rest timer, finish — without touching the
screen. It must feel **world-class and beautiful**, be **cost-efficient**, and
honor the app's **local-first / offline** DNA.

## Decisions (from brainstorm)

| Dimension | Decision |
|---|---|
| **Scope** | *Run the whole workout by voice*: set logging + flow control. Natural-language queries ("what did I bench last week?") are Phase 2. |
| **Understanding** | *Hybrid, ship on-device grammar first.* On-device STT + local grammar parser now; cloud LLM fallback is a pluggable Phase 2 swap behind one interface. |
| **Trigger** | *Tap once → hands-free listening session*, with *hold-to-talk* as a built-in fallback for noisy moments. *Wake word* is Phase 2. |
| **Confirm/correct** | *Confidence-based*: clear commands apply instantly with one-word undo; uncertain ones (bare numbers, cloud-fallback parses, finish-workout) confirm first. A **grammar guard** ignores any phrase that doesn't parse, so ambient chatter does nothing. |
| **Look** | *Inline morph*: the active set card itself becomes the mic; digits fill live as you speak; no separate mode/screen. Brutalist-lifter palette, mono numerics. |

## Architecture

Voice is a **thin input layer that maps spoken commands onto existing query
functions** (`addSet`, `updateSet`, `addExerciseToWorkout`, `searchExercises`,
`finishWorkout`, the rest timer). Voice writes nothing to SQLite directly — it
calls the same local-first mutations the buttons do, so offline, sync, undo, and
quarantine all work unchanged.

### Modules

| Module | Purpose | Purity / testability |
|---|---|---|
| `src/voice/commands.ts` | `Command` union type + `VoiceContext` type | types |
| `src/voice/numberWords.ts` | Spoken-numeral → number ("two twenty-five" → 225) | **pure — unit-tested** |
| `src/voice/grammar.ts` | `parse(transcript, context) → { command, confidence } \| null`. No I/O. | **pure — unit-tested (the heart)** |
| `src/voice/dispatch.ts` | `Command` → existing query calls, targeting the active-set cursor; returns an inverse for undo | orchestration — tested vs SQLite mock |
| `src/voice/speechEngine.ts` | Adapter over the on-device engine behind a `SpeechEngine`/`VoiceParser` interface; cloud fallback drops in later | adapter — device QA |
| `src/voice/useVoiceSession.ts` | Hook: listening lifecycle, partial transcripts, confidence→apply/confirm/undo, exposes UI state | hook — device/RNTL QA |
| `src/components/ActiveSetCard.tsx` (+ `VoiceMicButton`) | Inline-morph UI states | component — device/RNTL QA |

### Pluggable parser (the "hybrid later" hook)

`grammar.ts` (Phase 1) and a future `llmParser.ts` (Phase 2) both satisfy one
`parse()` interface. `dispatch`/session try grammar first; only on a
null/low-confidence parse **and** when online does it consult the LLM. Shipping
grammar-first is therefore a strategy swap, not a rewrite.

### Engine candidate

`expo-speech-recognition` (on-device iOS via the Speech framework). The repo
already has a native `ios/` dir, so a dev/config-plugin build is viable.
Requires `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`.

## Command vocabulary (Tier B grammar)

Context for parsing = active workout: current exercise, active-set cursor,
`profile.units` (kg/lb), exercise catalog (for fuzzy "add X").

**Logging — acts on the active set:**
- Weight + reps: `"185 for 5"`, `"one eighty-five for five"`, `"185 by 5"`, `"185 times 5"`, `"log 185 for 5 reps"` → `SetValues{weight:185, reps:5}`
- Weight only: `"185"`, `"weight 185"`, `"set it to 185"` → `SetValues{weight:185}` (low confidence if bare number)
- Reps only: `"5 reps"`, `"five reps"` → `SetValues{reps:5}`
- Unit override: `"100 kilos for 5"` → `SetValues{weight:100, unit:'kg', reps:5}`
- Complete & advance: `"done"`, `"complete"`, `"got it"`, `"logged"` → `CompleteSet`
- Add set: `"add a set"`, `"another set"`, `"one more"` → `AddSet`
- Correct: `"make it 195"`, `"no, 195"`, `"change it to 5 reps"` → `SetValues` correction; `"undo"`, `"scratch that"` → `Undo`

**Flow control:**
- `"add bench press"`, `"add incline dumbbell press"` → `AddExercise{name}` (fuzzy-match catalog; if no confident match, surface top matches / offer create)
- `"next exercise"` / `"previous exercise"` → `NextExercise` / `PrevExercise`
- `"start rest timer"`, `"rest"`, `"two minute rest"` → `StartRest{seconds?}`
- `"finish workout"`, `"end workout"` → `FinishWorkout` (**always** confirms — high stakes)
- `"stop"`, `"stop listening"` → `Stop` (ends the session)

**Confidence** = combination of (a) STT-provided confidence, (b) grammar match
strength: full pattern = high; bare number / partial = low; LLM fallback =
medium → confirm.

## Data flow

1. Tap mic on the set card → `useVoiceSession` starts the engine; card morphs (accent border, "listening", live waveform).
2. Engine emits partial + final transcripts.
3. Final transcript → `grammar.parse(transcript, context)`.
4. `null` → **ignored** (chatter guard). *(Phase 2: if online, try `llmParser`.)*
5. command + **high** confidence → `dispatch` immediately → "✓ logged" + undo affordance + success haptic.
6. command + **low** confidence → pending "Heard X — say 'yes' or repeat"; "yes" → dispatch, a new parse replaces it.
7. `FinishWorkout` → always pending confirm.
8. `Undo` → invoke the inverse returned by the last dispatch.
9. Session keeps listening for the next command until `Stop` / tap / silence timeout.

**Undo:** each `dispatch` returns an inverse thunk (e.g. logged 185×5 → restore
prior values; added set → delete it). Inverses call existing local mutations.

## Error handling & edge cases

- **Permission denied / STT unavailable / unsupported locale** → feature-detect; silently fall back to manual tapping; mic shows a disabled state; one-time explainer. No crash.
- **Offline** → grammar works fully; LLM fallback skipped.
- **`"185"` with no exercise yet** → prompt "add an exercise first". With an exercise but no staged set → `addSet` already auto-stages, then fill.
- **Ambiguous `"add X"`** → best fuzzy match if confident; else show top matches or offer "create custom exercise".
- **Units** → default `profile.units`; explicit "kilos"/"pounds" overrides that entry. `weight` stays a unit-agnostic `REAL` in the schema.
- **Gym chatter ("225 bro")** → bare numbers are low-confidence → require an explicit "yes"; session auto-times out after N seconds of no recognized command so nothing stays armed.
- **Rapid/double speech** → debounce final transcripts; one command per final.

## Testing strategy

Fits the existing ts-jest + better-sqlite3 harness.

- `numberWords.test.ts` — digit + spoken-numeral parsing, edge cases. **Pure.**
- `grammar.test.ts` — every command, phrasings, units, confidence levels, chatter→null. **Pure. The bulk and highest value.**
- `dispatch.test.ts` — command → correct mutation, active-set targeting, undo inverse, "no exercise" guard. Against the SQLite mock, like existing query tests.

**Not unit-testable in this Node/ts-jest harness** (require an Expo dev build /
RN renderer): `speechEngine.ts` (native), `useVoiceSession.ts` (hook),
`ActiveSetCard` morph UI. These get on-device QA; optional RNTL coverage later
once an RN test environment exists.

## Phasing

- **Phase 1 (shippable):** on-device STT + grammar + dispatch + inline-morph UI + tap-session trigger + hold-to-talk fallback + confidence confirm + undo. Tier B commands. Fully offline.
- **Phase 2:** cloud LLM fallback parser (pluggable), wake word ("Hey Coach"), natural-language queries (Tier C).

## Out of scope (now)

Wake word, cloud STT/LLM, natural-language history/progress queries,
multi-language, Android-specific tuning beyond baseline.
