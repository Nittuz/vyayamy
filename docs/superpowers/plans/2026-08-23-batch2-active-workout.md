# Batch 2: Active-Workout Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impeccable Batch 2 — kill the 4Hz full-tree re-render, give Prev a touch control, stop the swipe from eating scroll, and make voice discoverable.

**Architecture:** Task 1 restructures useRestTimer so the 250ms tick lives inside RestProgressBar (the only consumer of elapsed), then memoizes the card layer. Task 2 is control/gesture work in WorkoutActive + ActiveSetCard. Task 3 adds a VoiceHelpSheet. All three touch WorkoutActive.tsx — run sequentially.

**Tech Stack:** RN/Expo, reanimated 4, RNGH 2.31, existing ui primitives.

## Global Constraints

- Design source: the 2026-08-22 Impeccable critique (P0 voice-only prev; P1 swipe-eats-scroll; P1 4Hz re-render; H10 voice discoverability). Decisions here are settled by the owner's critique Q&A.
- Rest is neutral time: ink only, no volt, in everything rest-related. The prev control is a quiet ghost — `Next ›` keeps its current weight.
- Behavior invariants for Task 1 (regressions here are P0): rest persistence across remount (kvStore restore), the at-target success haptic fires exactly once per rest (incl. immediately on restore of an already-elapsed timer), notification schedule/cancel timing unchanged, spoken-duration override (`start(seconds)`) unchanged, `stop()` clears everything it clears today.
- 44pt touch floor; accessibilityLabel on every new control; product-language copy.
- Gates before every commit: `npm run typecheck && npm test && npm run lint && npm run format:check`. Conventional commits. Push only in Task 3's final step.

---

### Task 1: Rest-tick isolation + memoization (the P1 perf fix)

**Files:**

- Modify: `src/rest/useRestTimer.ts`, `src/rest/RestProgressBar.tsx`, `src/screens/WorkoutActive.tsx` (call sites + prop stabilization), `src/components/ActiveSetCard.tsx` (memo wrap), `src/components/SessionVolumeBar.tsx` (memo wrap)
- Test: create `src/rest/__tests__/restClock.test.ts` (pure elapsed derivation), extend nothing else (hook has no direct test today; the invariants ride on behavior preserved in code review)

**Interfaces:**

- Produces: `useRestTimer` returns a **useMemo-stable** `{ running: boolean; startedAt: number | null; targetSeconds: number; start(secondsOverride?: number): void; stop(): void }` — `elapsed` is REMOVED from the hook API. `RestProgressBar` props become `{ running, startedAt: number | null, targetSeconds, onSkip, onOpenOverride? }`.

- [ ] **Step 1: Hook restructure** (`useRestTimer.ts`):
  - Delete the `elapsed` state and the 250ms interval effect entirely.
  - Preserve the at-target haptic with a timeout effect keyed on `[startedAt, activeTarget]`:

```ts
// At-target haptic — a single timeout instead of a per-250ms check; computed
// from startedAt so a restored, already-elapsed timer still fires once.
useEffect(() => {
  if (startedAt == null) return;
  const remainingMs = startedAt + activeTarget * 1000 - Date.now();
  const fire = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  if (remainingMs <= 0) {
    fire();
    return;
  }
  const t = setTimeout(fire, remainingMs);
  return () => clearTimeout(t);
}, [startedAt, activeTarget]);
```

- `start` no longer calls `setElapsed(0)`; `stop` no longer calls `setElapsed(0)`. `intervalRef` is deleted.
- Return a stable object: `return useMemo(() => ({ running: startedAt != null, startedAt, targetSeconds: activeTarget, start, stop }), [startedAt, activeTarget, start, stop]);`

- [ ] **Step 2: Bar owns the clock** (`RestProgressBar.tsx`): props swap `elapsedSeconds: number` → `startedAt: number | null`. Inside:

```ts
const elapsedSeconds = useRestClock(running ? startedAt : null);
```

with, in the same file (exported for the test):

```ts
/** Seconds since startedAt, self-ticking at 250ms — scoped so the rest
 *  countdown re-renders only this panel, not the whole screen (Batch 2 P1). */
export function useRestClock(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() => elapsedSecondsSince(startedAt, Date.now()));
  useEffect(() => {
    setElapsed(elapsedSecondsSince(startedAt, Date.now()));
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(elapsedSecondsSince(startedAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function elapsedSecondsSince(startedAt: number | null, now: number): number {
  return startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
```

The rest of the component (fraction/remaining/fill/skip/override) is unchanged. Test `elapsedSecondsSince` (null → 0; exact seconds; pre-start clock skew → 0) in `restClock.test.ts`.

- [ ] **Step 3: WorkoutActive call sites**: `RestProgressBar` gets `startedAt={timer.startedAt}` instead of `elapsedSeconds={timer.elapsed}`. Verify `timer.elapsed` has no other reader (grep). The now-stable `timer` fixes `onComplete`/`onFinish` `useCallback` churn — confirm their deps still list `timer` and now actually stabilize.

- [ ] **Step 4: Memo the leaves + stabilize props** (`WorkoutActive.tsx`):
  - `const ghostSets = useMemo(() => completedSetsBeforeCursor(currentEx, cursor), [currentEx, cursor]);` — mind hook ordering: this must sit above the early returns with the other hooks; if `currentEx`/`cursor` can be null there, make `completedSetsBeforeCursor` tolerate it or guard inside the memo body (return `[]`).
  - Same treatment for the inline `lastTime` object and the `voice={{ phase, partial, feedback }}` literal (useMemo each).
  - Replace the inline `onComplete={(values) => void onComplete(values)}` arrow with a `useCallback`.
  - Wrap `ActiveSetCard`'s export in `React.memo` (it is forwardRef — `memo(forwardRef(...))`, keep the display name) and `SessionVolumeBar`'s export in `React.memo`.

- [ ] **Step 5: Behavior self-check against the invariants list** (restore path, haptic-once, spoken override, stop-clears) by reading your final code against each; document per-invariant in the report. Gates green; commit: `perf(workout): scope the rest tick to RestProgressBar; memo the card layer (impeccable batch 2)`

---

### Task 2: Prev control + swipe activation + hint contrast

**Files:**

- Modify: `src/screens/WorkoutActive.tsx` (bottom bar), `src/screens/workoutActive/useWorkoutCursor.ts` (only if a hasPrev helper is missing), `src/components/ActiveSetCard.tsx` (gesture + hint), `src/components/activeSet.ts` (+ test) if the hasPrev derivation lands there

**Interfaces:**

- Consumes: `onPrevExercisePress` (exists, WorkoutActive.tsx:255-257, currently voice-only), `chevron-left` icon (exists unused, icons.tsx), the leave-confirm guard already inside `onPrevExercise`.

- [ ] **Step 1: hasPrevExercise.** Mirror however `hasNextExercise` is derived (find it — it feeds the `Next ›`/`Finish ›` label). If it's a pure derivation over `exercises`+`cursor`, add the prev twin beside it (pure helper + test if it lands in activeSet.ts).

- [ ] **Step 2: The control.** In the bottom bar, before `Next ›`:

```tsx
<Button
  kind="ghost"
  size="cta"
  icon="chevron-left"
  label=""
  disabled={!hasPrevExercise}
  onPress={onPrevExercisePress}
  accessibilityLabel="Previous exercise"
  style={styles.prevBtn}
/>
```

Check Button's actual API first (icon-only support, empty-label rendering — if `label=""` renders badly, use the icon-only pattern the codebase already has, or fall back to a labeled `‹` glyph via Icon inside a Pressable with the 44pt floor). `prevBtn`: fixed width ≈ `theme.touch.min`, no flex — `Log set` keeps its dominance; `Next ›` keeps its current flex. Disabled state uses the Button's existing disabled treatment (no new colors).

- [ ] **Step 3: Swipe up-only.** In `ActiveSetCard.tsx` replace `.activeOffsetY([-10, 10])` with `.activeOffsetY(-10).failOffsetY(10)` — up activates the log gesture, down fails fast and hands the drag to the ScrollView. The `!canComplete` damped tug only ever responds to upward drags (`Math.min(0, …)`), so it survives unchanged. Verify no `simultaneousWithExternalGesture` is needed: with failOffsetY the ScrollView takes over on failure (test note: this is the standard RNGH pattern; document in the report that live-gesture QA is deferred to device).

- [ ] **Step 4: Hint contrast.** Swipe-hint Text color `theme.color.inkTertiary` → `theme.color.inkSecondary` (both hint states). It carries the signature interaction; it must not be the faintest text on the card.

- [ ] **Step 5:** Gates green; commit: `feat(workout): touch control for previous exercise; up-only swipe frees scrolling (impeccable batch 2)`

---

### Task 3: Voice discoverability + batch push

**Files:**

- Create: `src/components/VoiceHelpSheet.tsx`
- Modify: `src/screens/WorkoutActive.tsx` (trigger + mount)

- [ ] **Step 1: The sheet.** New `VoiceHelpSheet` on the `Sheet` primitive (`variant="bottom"`, `title="Voice commands"`), pure presentational: `{ visible, onClose }`. Content: grouped rows (group label = `strip` variant, examples = `body` with the spoken phrase in quotes). Groups and examples (match the real grammar — do not invent phrases):
  - LOG A SET — "80 for 5" · "12 reps at 60" · "15 reps"
  - COMPLETE — "Done" · "Next set"
  - EXERCISES — "Add a set" · "Add bench press" · "Next exercise" · "Previous exercise"
  - REST — "Start rest" · "Rest two minutes" · "Skip rest"
  - SESSION — "Finish workout" · "Undo" · "Stop listening"
    Layout: plain rows, generous group separation (`theme.space` tokens), no cards-in-cards, no volt.

- [ ] **Step 2: The trigger.** In the voice area next to `VoiceMicButton`, render (only when `voice.available`) a meta-variant Pressable "What can I say" (color `inkSecondary`, 44pt via hitSlop, accessibilityLabel "Voice command help") that opens the sheet. Local `useState` + mount alongside the other sheets, same idiom.

- [ ] **Step 3:** Gates green; commit: `feat(voice): "what can I say" help sheet (impeccable batch 2)`. Then `git add` this plan file if untracked, commit `docs: batch-2 plan (executed)`, `git push`, and watch CI green (`gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')`).

---

## Verification limits

No tap injection on this host's simulator — gesture/scroll and prev-button feel ride on code review + the device-QA rider. Boot smoke after the batch is the only live check.
