# Copy review — findings & plan (all screens)

- Date: 2026-08-24
- Status: approved — executed
- Source: full copy census (~253 visible sites + ~62 a11y) against the impeccable clarify rubric

## Verdict

The app's copy is largely strong: destructive confirms name their cost ("5 incomplete sets
will be discarded."), empty states distinguish first-use from no-data, the voice help sheet
teaches real phrases, and the sync surfaces are honest. This plan is a tightening pass —
five small batches, no rewrite.

## Batch V — the Voice control (owner's flagged item)

Current: full-width ghost row with a 16pt mic icon + the word "Voice"; while listening it
swaps to "Listening · tap to stop" with a volt fill. Directly beneath: "What can I say".

Finding: the word "Voice" is redundant three ways — the mic glyph is one of the few
universally-read icons, "What can I say" beneath it already names the modality, and the
LISTENING state is already narrated on the set card itself ("Listening…", live partials,
"Heard X. Say yes to confirm"), so the button's own status label duplicates the card.

**Proposal**: icon-only mic button — icon up from 16pt to 24pt in a compact ~56pt-wide
control (44pt+ target), centered; volt fill remains the listening signal; BOTH visible
labels removed ("Voice" and "Listening · tap to stop"); the card keeps narrating state
(it already does); a11y labels unchanged ("Start/Stop voice logging").
Also: "What can I say" → "What can I say?" (it is a question; the mark aids scanning).

Risk & mitigation: first-run discoverability rests on the mic glyph + the help link —
both remain directly adjacent. If it tests poorly on device, restoring the idle label
is a one-line revert.

## Batch A — one error voice (10 strings)

Two error registers coexist. The app's voice is terse; standardize on the contracted form
("Couldn't … Try again."):

| Current                                                  | Becomes                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| Could not start the scheduled workout. Please try again. | Couldn't start the scheduled workout. Try again. |
| Could not start the quick log. Please try again.         | Couldn't start the quick log. Try again.         |
| Could not repeat the workout. Please try again.          | Couldn't repeat the workout. Try again.          |
| Could not start the workout. Please try again.           | Couldn't start the workout. Try again.           |
| Could not finish the workout. Please try again.          | Couldn't finish the workout. Try again.          |
| Could not save the note. Please try again. (×2)          | Couldn't save the note. Try again.               |
| Could not rename the workout. Please try again.          | Couldn't rename the workout. Try again.          |
| Could not undo the delete. Please try again.             | Couldn't undo the delete. Try again.             |
| Could not delete the workout. Please try again.          | Couldn't delete the workout. Try again.          |

(The "Couldn't …" half of the app already reads this way — sets, exercises, plan, profile.)

## Batch B — real plurals, never "(s)" (5 sites)

The app pluralizes properly in History/Today/confirms; these drifted:

| Where                               | Current                          | Becomes                                                |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------ |
| TrainingPlan day rows               | `${n} exercise(s)`               | `1 exercise` / `${n} exercises`                        |
| PlanCard strip                      | `${n} exercise(s)`               | same treatment                                         |
| RepeatCard strip (repeatCardFormat) | `${n} exercise(s)`               | same treatment                                         |
| CollisionSheet row meta             | `${n} exercise(s) · ${n} set(s)` | real plurals both                                      |
| (shared helper)                     | —                                | one `pluralize(n, noun)` helper + tests, reused by all |

## Batch C — consistency nits (6 items)

1. **Notes naming**: recap buttons "Session note" / "Edit session note" open the same
   sheet titled "Notes" that the active-screen "Notes" button opens. Unify triggers to
   "Notes" / "Edit notes".
2. **RestOverrideSheet null muscle group**: "Default for this: 90s" (when muscleGroup is
   null) → "Default: 90s".
3. **"None" vs "No template"**: PlanSetup's day option says "None"; TrainingPlan renders
   that state as "No template". Unify display to "None" (matches the control the user set).
4. **ExercisePicker placeholder**: "Search, or type to create" → "Search or type to create".
5. **SyncDiagnosticsSheet intro**: "Read-only view of the sync engine's state." →
   "A read-only look at sync." (drops internal jargon; power surface, low stakes).
6. **Today gap-day strip**: "Nothing scheduled · {plan}" → "Nothing scheduled today · {plan}"
   (the plan name after a bare "Nothing scheduled" reads as if the plan itself is nothing).

## Batch D — boot failure honesty (1 surface)

BootOverlay currently prints the raw thrown error under "Cannot start" (e.g. "Database init
exceeded 8000ms" — developer text as the primary message). Becomes:

- Title: "FlexYug can't start"
- Body: "Something blocked the app from loading your data. Close and reopen the app; if
  this keeps happening, reinstall — your workouts are synced."
- The raw error demotes to a small mono detail line (kept for support/screenshots).
  Honesty guard: the "your workouts are synced" clause renders only the neutral variant
  "reinstalling won't lose synced workouts" if we cannot know sync state at boot-fail time —
  implementer verifies what's knowable there.

## Explicitly reviewed and left alone

- All destructive confirm copy (names action + cost everywhere) — the app's best writing.
- Voice help sheet's 17 example phrases (verified against the real grammar).
- Empty states (first-use vs not-found are correctly distinguished).
- Sync pill states, quarantine sheet ("Stuck syncs" is good product voice), rest-alert
  status table (ON/MUTED/OFF + hints).
- `LOG SET · 52.5 × 3` / `LAST TIME · 52.5 × 3` unitless echoes — documented decision
  (units live on the hero numerals; the echo is deliberately compact).
- Brand strings (tagline, wordmark, poster headlines) — identity, not copy.

## Execution shape (after owner approval)

One implementer task per batch is overkill; this ships as ONE commit-train task
(V, A+B share a commit, C, D), TDD on the new pluralize helper + changed pure formatters,
full gates, live screenshot pass on the Voice control (both states) and BootOverlay
(simulated failure), review gate, push.
