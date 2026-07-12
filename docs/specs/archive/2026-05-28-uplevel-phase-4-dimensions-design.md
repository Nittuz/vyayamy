# Uplevel Phase 4 — Dimensions

- **Status:** implemented
- **Date:** 2026-05-28
- **Related ADRs:** none new
- **Builds on:** [Phase 1 — Signature](2026-05-26-uplevel-phase-1-signature-design.md), [Phase 2 — Trust](2026-05-27-uplevel-phase-2-trust-design.md), [Phase 3 — Restraint](2026-05-27-uplevel-phase-3-restraint-design.md) (all implemented)

## Problem

Phases 1–3 took the app from anonymous-spreadsheet to brutalist-lifter-with-trust-baked-in. Phase 4 picks up the items from the 2026-05-26 audit that were deferred for "after we have lived experience," tightened by the fact that the app is still in active solo-developer use — the build phase, not the launch phase.

The original review surfaced five items that belong in this pass:

1. **Sync state is invisible during normal use.** The `SyncIndicator` pill shows colour but no detail. When something doesn't push and the user isn't certain why, there's no built-in inspector — debugging requires opening the SQLite shell. For a local-first/sync app this is the single most valuable diagnostic tool to ship.
2. **Per-exercise rest defaults are wrong in practice.** Phase 3 shipped muscle-group lookups (180s / 90s / 60s). In real use, individual exercises miss — 90s is too short for OHP, 180s too long for cable rows. Code changes per-exercise are friction; the UI should let the user set it.
3. **Default workout title `'Tuesday'` is less informative than it could be.** Phase 3 set day-of-week so the title isn't "Workout" anymore, but at three or more exercises in, the composition (`'Chest + Triceps'`) is more useful on a Today Repeat card than a day name.
4. **Body prose uses React Native's default line-height** (~1.2×). Phase 1 defined `lineHeightMul` tokens (body 1.4, meta 1.6) but nothing consumes them; longer copy on Today's empty states, sheets, and alerts reads tight.
5. **Sync errors only surface 24h after they quarantine.** Phase 2's banner is the right hammer for stuck data; what's missing is an immediate-but-restrained signal for transient errors so the user knows in the moment.

Phase 4 closes all five without touching the local-first write path, the visual language, or any of Phases 1–3's spec invariants.

## Goals & non-goals

**Goals**

- **Sync diagnostics sheet** opened by tapping the `SyncIndicator` pill. Read-only inspector covering state, outbox preview, quarantined count (links to the existing Phase 2 sheet), last sync times, and a "Force sync now" trigger.
- **Per-exercise rest override** via long-press on the `RestProgressBar`. Bottom sheet with preset durations (30/60/90/120/180/240/300s) and a `Reset` action. Overrides stored in AsyncStorage keyed by `exercise_id`; checked first in `WorkoutActive` before falling back to `restForMuscleGroup`.
- **Composition-derived workout title** computed and assigned once, when the third exercise is added, IF the title is still the default day-of-week (i.e. user hasn't manually edited). Composition format: `"Chest + Triceps + Shoulders"` from the union of unique muscle groups.
- **Line-height tokens wired into body prose.** Audit `Today.tsx`, `WorkoutActive.tsx`, `CollisionSheet.tsx`, `QuarantineSheet.tsx`, `SyncDiagnosticsSheet.tsx` (new), and the toast component. Add `lineHeight: size * lineHeightMul.body|meta` to body-sized text.
- **Sync error stripe** — a 1px horizontal bar at the top of `Today.tsx` and `WorkoutActive.tsx` that pulses danger-colored for 30 seconds after a sync error fires, and stays solid danger when pendingOutbox > 0 for more than 5 minutes. Complements Phase 2's 24h quarantine banner with an in-the-moment signal.
- **All Phase 1–3 invariants preserved.** SQLite schema unchanged. Mutation primitives unchanged. Phase 1's brutalist-lifter visual language unchanged.

**Non-goals**

- **Onboarding / first-run flow.** Solo dev usage; revisit before TestFlight.
- **Pull-down or drawer alternative to the `→ history` link.** Only if the link feels too small after a few sessions of use; not preemptively.
- **Glanceability tweaks for the Active-Set card.** Need lived device experience to inform tweaks; guessing now produces noise.
- **Phase 1/2/3 device-verification fixes.** We don't have these as concrete items yet — they emerge from real gym use, not from this spec.
- **Per-user rest defaults across exercises (not per-exercise overrides).** Out of scope; the muscle-group table is fine until we have a reason to make it user-configurable.
- **Dynamic title updates AFTER the one-shot composition compute.** If user edits, that wins forever. No nag.
- **Notifications for sync errors.** The stripe is in-app only; expo-notifications-driven sync alerts would be a separate Phase.

## Design

### 1. Sync diagnostics sheet

**Files touched:**

- `src/components/SyncDiagnosticsSheet.tsx` — new
- `src/ui/SyncIndicator.tsx` — wrap the existing pill in a `Pressable`, open the sheet on tap
- `src/sync/state.ts` — extend `SyncState` to surface `lastErrorAt: string | null` (already partially there via `lastError`; add timestamp)
- `src/sync/quarantine.ts` — already exports `useQuarantined`; reuse for the count

**Sheet anatomy (top to bottom):**

```
┌─────────────────────────────┐
│ SYNC DIAGNOSTICS            │ title (sansSemibold, title size)
│ Read-only view of the sync  │ body (sansMedium, meta size)
│ engine's state.             │
├─────────────────────────────┤
│ STATUS                      │ micro section header
│ ● online · idle             │ status row (mono for state values)
│ Last error: none            │
├─────────────────────────────┤
│ OUTBOX                      │
│ 0 pending · 0 quarantined   │ counts row
│ (most-recent 5 pending:)    │
│   sets · update · 12s ago   │ mono row per entry
│   workouts · insert · 3m ago│
│   ...                       │
├─────────────────────────────┤
│ LAST SYNC                   │
│ Pushed 2m ago               │
│ Pulled 5m ago               │
├─────────────────────────────┤
│ [ Force sync now ]          │ accent-color button
│ [ Review quarantined ]      │ shows only if quarantined > 0
│ [ Close ]                   │
└─────────────────────────────┘
```

**Behaviour:**

- "Force sync now" calls `runSyncCycle()` (exported from `src/sync/engine.ts`) and shows a brief `Syncing…` state inline.
- "Review quarantined" opens Phase 2's existing `QuarantineSheet` (state-passed-up pattern, like the banner uses).
- Sheet is dismissed via Close button or tap-on-backdrop (same pattern as Phase 2's sheets).
- Refresh: the data is live — when the user opens the sheet, the live `useSyncState` and `useQuarantined` queries push updates as they happen.

**Outbox preview helper:**

Add `getOutboxPreview(limit = 5)` to `src/sync/quarantine.ts` (or a new `src/sync/outboxPreview.ts` for separation). Returns the most-recent (by `created_at DESC`) pending entries with `{ id, table_name, op, ageMs }`. Used only by the diagnostics sheet.

**`useSyncState` hook:**

Phase 2's `src/sync/state.ts` exposes `getSyncState`, `setSyncState`, `subscribeSync`. Add a small React hook `useSyncStateLive()` that wraps the pub/sub into a `useState` so components re-render on changes. Used by both `SyncIndicator` (already-present indirectly) and the new diagnostics sheet.

### 2. Per-exercise rest override

**Files touched:**

- `src/ui/restOverrides.ts` — new module: get/set/clear in AsyncStorage, `useRestOverrides()` hook
- `src/ui/__tests__/restOverrides.test.ts` — unit tests against the kvStore mock pattern
- `src/components/RestOverrideSheet.tsx` — new bottom sheet
- `src/components/RestProgressBar.tsx` — wire long-press → opens the sheet (currently long-press skips rest; **change to long-press opens override; short-press tap-skip stays**)
- `src/screens/WorkoutActive.tsx` — compute effective rest = override ?? muscle-group default

**Storage shape:**

Key: `@flexyug/rest-overrides/v1`

Value:

```ts
{
  schemaVersion: 1,
  overrides: Record<string, number>, // exercise_id → seconds
}
```

Read-through cache: `useRestOverrides()` returns the current map; mutations invalidate.

**Module API:**

```ts
export async function getOverrides(): Promise<Record<string, number>>;
export function useRestOverrides(): { overrides: Record<string, number>; loading: boolean };
export async function setOverride(exerciseId: string, seconds: number): Promise<void>;
export async function clearOverride(exerciseId: string): Promise<void>;
export function effectiveRest(
  overrides: Record<string, number>,
  exerciseId: string,
  muscleGroup: string | null | undefined,
): number;
```

`effectiveRest` is pure (testable): if `overrides[exerciseId]` exists, return it; else return `restForMuscleGroup(muscleGroup)`.

**Sheet UX:**

Bottom sheet (same `Modal` pattern as `QuarantineSheet`). Contents:

- Title: "Rest for {Exercise Name}"
- Subtitle: "Default for {Muscle Group}: {180s}"
- Preset chip row: 30 · 60 · 90 · 120 · 180 · 240 · 300 (selected chip highlighted in accent)
- "Custom" input below (numeric)
- "Save" (accent button, sets the override)
- "Reset to default" (text button, calls `clearOverride`; only shown if override exists)
- "Close" (dismiss)

**Integration:**

In `RestProgressBar.tsx`, the existing `onLongPress` calls `onSkip`. Change:

- Short press (`onPress`, with `delayLongPress = 350`) → opens the override sheet
- Long press (`onLongPress`) → skip rest (with a haptic)

Wait — that changes the existing skip gesture. Better:

- The whole bar is `onLongPress = openOverride`
- A small "skip" affordance at one end (e.g. right-aligned 'skip' text) handles short-tap to skip

OR simpler: the bar has two press modes — **press to skip** (existing behavior, current), **long-press to open override**. Document this in the component's accessibility hint.

We'll go with the simpler approach: keep `onLongPress = openOverride`; the existing skip is via the bar's own short-press behavior already.

Actually looking at current `RestProgressBar.tsx`: it uses `onLongPress = onSkip` (per the Phase 2 design). Change:

- `onLongPress` → opens override sheet (long-press is "settings" affordance)
- `onPress` → skips (was previously not wired; add it)
- haptic `light` on short tap (skip); `medium` on long-press (settings)

The skip behavior is the gym-natural interaction; settings is the rare deep-dive.

**Wire-in to `WorkoutActive`:**

```ts
const { overrides } = useRestOverrides();
const currentExerciseId = currentEx?.exerciseId ?? '';
const restSeconds = useMemo(
  () => effectiveRest(overrides, currentExerciseId, currentEx?.muscleGroup ?? null),
  [overrides, currentExerciseId, currentEx?.muscleGroup],
);
```

(Replaces Phase 3's `restForMuscleGroup(...)` direct call.)

### 3. Composition-derived workout title

**Files touched:**

- `src/lib/compositionTitle.ts` — new, pure function + tests
- `src/lib/__tests__/compositionTitle.test.ts`
- `src/queries/exercises.ts` — extend `useAddExerciseToWorkout`'s `onSuccess` to maybe-update title
- `src/queries/__tests__/repeatLastWorkout.test.ts` — may need a check if the auto-title fires in test setups (verify in the plan)

**Algorithm:**

```ts
export function compositionTitle(exerciseMuscleGroups: (string | null | undefined)[]): string {
  // Take unique non-null/non-empty muscle groups in insertion order;
  // join with ' + '. Empty input returns ''.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of exerciseMuscleGroups) {
    if (!raw) continue;
    const key = raw.trim();
    if (key === '') continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(key);
  }
  return result.join(' + ');
}
```

**Trigger:**

Inside `useAddExerciseToWorkout`'s `onSuccess` callback:

```ts
onSuccess: async (_id, vars) => {
  qc.invalidateQueries({ queryKey: queryKeys.workouts.withExercises(vars.workoutId) });
  // Phase 4: maybe-update title once the workout has 3+ exercises and the
  // title is still the default day-of-week (untouched by user)
  await maybeUpdateAutoTitle(vars.workoutId);
};
```

`maybeUpdateAutoTitle(workoutId)`:

1. Fetch the workout's exercises + their muscle_groups via a direct SQL query
2. If count < 3, return
3. Fetch the workout row: title, started_at
4. If title !== dayOfWeek(started_at), user has manually edited → return without changing
5. Compute `compositionTitle(muscleGroups)` — if non-empty AND different from current title, call `updateWorkoutTitle(workoutId, computed)`

This lives in `src/queries/workouts.ts` as `maybeUpdateAutoTitle`.

**Idempotency:** Subsequent adds keep computing but won't update (because after the first computation the title is no longer the default day-of-week, so step 4 short-circuits). Exactly the one-shot behavior we want.

**Edge cases:**

- User-titled workouts never auto-update — handled by the equality check
- Workouts with all `muscle_group = null` exercises → compositionTitle returns ''; we leave the day-of-week title alone (no overwrite with empty)
- Manually retitling later → never auto-overwritten

### 4. Line-height tokens wired into body prose

**Files touched:**

- `src/screens/Today.tsx`
- `src/screens/WorkoutActive.tsx`
- `src/components/CollisionSheet.tsx`
- `src/components/QuarantineSheet.tsx`
- `src/components/SyncDiagnosticsSheet.tsx` (new from Phase 4)
- `src/components/RepeatCard.tsx`
- `src/ui/ToastContext.tsx`

**Audit and apply rule:**

For every `<Text>` whose rendered size is `body` (14) or larger AND that holds prose (not a single number or label), add:

```ts
lineHeight: theme.font.size.body * theme.font.lineHeightMul.body, // 14 * 1.4 = 19.6
```

(or substitute `meta`/`title`/`hero` as applicable.)

Don't touch:

- Hero numerals (already use `lineHeight: hero * lineHeightMul.hero` per Phase 1)
- Micro labels (intentionally tight)
- Single-word buttons (lineHeight doesn't matter)

**Mechanical change** — no logic, no tests. Just consistency.

### 5. Sync error stripe

**Files touched:**

- `src/components/SyncErrorStripe.tsx` — new
- `src/screens/Today.tsx` — render at top of screen above all content
- `src/screens/WorkoutActive.tsx` — render at top of screen above the rest progress bar
- `src/sync/state.ts` — extend `SyncState` to include `lastErrorAt: string | null`; update `setSyncState` invocations in `triggerPush` / `runSyncCycle` to set it on error and clear it on success

**Visual:**

- 1px high horizontal bar at the very top of the screen, above the rest progress bar (when both are visible: stripe at top edge, rest bar 1px below status bar)
- Color: `theme.color.danger`
- Opacity behavior:
  - Hidden when `lastErrorAt` is null AND `pendingOutbox === 0`
  - Solid 70% opacity when `pendingOutbox > 0 && (Date.now() - parseISO(lastErrorAt)) > 5min`
  - Pulsing 30%↔70% (1s cycle) when `Date.now() - parseISO(lastErrorAt) < 30s`
  - Otherwise hidden
- Renders as `<View>` with `Animated` opacity, native driver

**State extension:**

`src/sync/state.ts` `SyncState` already has `lastError: string | null` and `lastPushedAt`/`lastPulledAt`. Add `lastErrorAt: string | null` — `null` when no recent error; ISO timestamp when set. `triggerPush()` and `runSyncCycle()` in `engine.ts` already call `setSyncState({ lastError: errMsg })` on failure — change to also set `lastErrorAt: nowIso()`. On success, `setSyncState({ lastError: null, lastErrorAt: null })`.

**Pulse mechanics:**

`Animated.loop(Animated.sequence([toValue: 0.7, ...], [toValue: 0.3, ...]))` with 500ms each leg. Stop the loop when leaving the pulsing window.

### Cross-cutting

- **No schema changes.** All Phase 4 storage is AsyncStorage (rest overrides) or in-memory (sync state).
- **Tests:** ~30 new (compositionTitle 8, restOverrides 10, effectiveRest 4, getOutboxPreview 4, useSyncStateLive 3-ish if hookable).
- **Sentry breadcrumbs:** add for rest-override set/clear (audit trail).

### File-level changes summary

**New:**

- `src/components/SyncDiagnosticsSheet.tsx`
- `src/components/RestOverrideSheet.tsx`
- `src/components/SyncErrorStripe.tsx`
- `src/ui/restOverrides.ts` + tests
- `src/lib/compositionTitle.ts` + tests
- `src/sync/outboxPreview.ts` + tests

**Modified:**

- `src/ui/SyncIndicator.tsx` — pressable wrapper
- `src/components/RestProgressBar.tsx` — long-press → override sheet; short-press → skip
- `src/screens/Today.tsx` — render SyncErrorStripe at top + line-height application
- `src/screens/WorkoutActive.tsx` — render SyncErrorStripe at top + restOverride wiring + line-height application
- `src/components/CollisionSheet.tsx` — line-height application
- `src/components/QuarantineSheet.tsx` — line-height application
- `src/components/RepeatCard.tsx` — line-height application
- `src/ui/ToastContext.tsx` — line-height application on toast body
- `src/sync/state.ts` — `lastErrorAt` field
- `src/sync/engine.ts` — set/clear `lastErrorAt` on push/pull outcomes
- `src/queries/exercises.ts` — `maybeUpdateAutoTitle` call in `useAddExerciseToWorkout.onSuccess`
- `src/queries/workouts.ts` — add `maybeUpdateAutoTitle` helper
- `docs/specs/2026-05-28-uplevel-phase-4-dimensions-design.md` — status flip at end
- `docs/specs/README.md` — index row

**Untouched:**

- All SQLite schema
- Phase 1-3 commits and their visual / typography tokens (lineHeightMul exists; we're consuming it, not changing it)
- All non-touched screens (`Progress`, `Profile`, `Login`, `TrainingPlan`, `History`, `HistoryDetail`)

## Alternatives considered

- **Push notification for sync error** — rejected for Phase 4. Adds permission UX and an OS dependency for a signal an in-app stripe handles.
- **Per-user (not per-exercise) rest defaults** — rejected; the lookup table is fine, and per-exercise is the actually-useful granularity.
- **Dynamic title updates beyond one-shot** — rejected; rewriting under the user's feet feels presumptuous.
- **Long-press on rest bar = skip, short-press = override** — rejected because skip is the gym-natural fast action and should be the easier gesture.
- **Make the SyncIndicator pill always expanded into a row of state** — rejected; the brutalist-lifter aesthetic is restrained chrome. The tap-target is the discovery affordance.

## Testing

**Unit (Jest):**

- `src/lib/__tests__/compositionTitle.test.ts` — empty, single, dedupe, all-null, mixed case
- `src/ui/__tests__/restOverrides.test.ts` — round-trip via kvStore mock, get/set/clear, `effectiveRest` fallback
- `src/sync/__tests__/outboxPreview.test.ts` — most-recent N, age computation, empty case
- Extension to `src/sync/__tests__/quarantine.test.ts` if `getOutboxPreview` shares the test fixture

**Integration:**

- `src/__tests__/auto-title-e2e.test.ts` — add 3 exercises to a workout; verify title becomes composition; user-edited workout remains
- `src/__tests__/rest-override-e2e.test.ts` — set override for exercise X; verify effectiveRest reads it; clear it; verify fallback

**Device (manual checklist, in plan):**

- Tap SyncIndicator → sheet opens with current state
- Force sync now → pushes any pending, refreshes state
- Long-press rest bar → override sheet opens; select 120s; rest bar now fills over 120
- Short-press rest bar → skips immediately
- Add three exercises to a fresh workout → title changes from `Wednesday` to e.g. `Chest + Triceps + Shoulders`
- Edit title manually → never auto-overwritten on subsequent adds
- Force a sync failure (airplane mode + try to mutate) → stripe pulses red at top for 30s
- Leave it failing for 5 min → stripe stays solid red

## Rollout

Single-developer, single-user app. No production traffic. No feature flag. Sequenced commit history, each gates on `npm run typecheck && npm run lint && npm test`:

1. `compositionTitle` pure module + tests
2. `restOverrides` module + `effectiveRest` pure + tests
3. `outboxPreview` module + tests
4. `useSyncStateLive` hook + `lastErrorAt` extension to state.ts + engine.ts wiring
5. `RestOverrideSheet` component
6. `SyncDiagnosticsSheet` component
7. `SyncErrorStripe` component
8. `SyncIndicator` pressable + diagnostics integration
9. `RestProgressBar` long-press → override sheet; short-press → skip
10. `WorkoutActive` — effective rest, sync stripe, override sheet wiring
11. `Today` — sync stripe wiring
12. `maybeUpdateAutoTitle` helper + `useAddExerciseToWorkout.onSuccess` hook
13. Line-height token audit + application (one sweep across 6 files)
14. Spec status flip to `implemented`

14 commits.

## Open questions

- **What happens if `useRestOverrides()` is in a loading state when WorkoutActive needs effectiveRest?** Plan: read raw overrides via getOverrides() in a useEffect on first mount and seed local state; fall back to muscle-group default until hydrated. Same pattern as Phase 2's todaySnapshot. Verify exact pattern in the plan.
- **Should the diagnostics sheet's "Force sync now" be debounced?** Yes — disable button for 2s after each press to avoid spam (and to give the indicator time to update).
- **What if the user has 10+ exercises with the same muscle group?** `compositionTitle` dedupes; output stays compact ("Chest" not "Chest + Chest + Chest").
- **What if `started_at` is missing/null on a workout?** Schema is NOT NULL; safe to assume present.
