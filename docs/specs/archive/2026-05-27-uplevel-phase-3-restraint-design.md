# Uplevel Phase 3 — Restraint

- **Status:** implemented
- **Date:** 2026-05-27
- **Related ADRs:** none new; respects [ADR-0001](../adr/0001-sqlite-as-source-of-truth.md), [ADR-0002](../adr/0002-outbox-over-crdt.md)
- **Builds on:** [Phase 1 — Signature](2026-05-26-uplevel-phase-1-signature-design.md) (implemented), [Phase 2 — Trust](2026-05-27-uplevel-phase-2-trust-design.md) (implemented)

## Problem

Phases 1 and 2 added — the Active-Set card, Repeat-Last-Workout, the brutalist-lifter typography, the kvStore foundation, the collision sheet, the quarantine banner. Phase 3 *removes*. The 2026-05-26 audit named restraint as the move; six items in the working app are leftover scaffolding, half-finished idioms, or chrome that's quietly competing for attention:

1. **`+ Add set` button** in the workout flow forces the user to pre-plan reps before doing them. A lifter doing AMRAP, drop sets, or simply "as many as I feel like" shouldn't have to think about row creation. The button is a tax.
2. **Hardcoded 90s rest timer** is wrong for everything — too long for curls, too short for squats. The audit called this out as "the worst of both."
3. **Default workout title `'Workout'`** is the first thing the user sees on a Repeat card and it's the most generic possible label.
4. **History tab in primary nav** over-promises feature surface. Strength training is forward-looking; history is a lookup, not a destination.
5. **Dashed border** on `+ Add exercise` is a 2014 Bootstrap-era idiom that doesn't match the brutalist-lifter language.
6. **Phase 1 imported `SafeAreaView` from `react-native`** (deprecated); the project's standard is `react-native-safe-area-context`.

Plus two type-system polish items the audit flagged that became more visible after Phase 1 shipped:

7. **Micro labels at 10pt** are too small to glance-read in a gym with sweaty squinting eyes.
8. **`inkTertiary` contrast** needs an audit against the brutalist dark palette to confirm it passes WCAG AA for body-sized text.

And one source of mid-set noise the audit named:

9. **Sync error toasts during active workouts** pull attention from the lift to recover from a transient network condition the SyncIndicator already shows.

Phase 3 cuts all nine without touching the local-first write path or the visual language established in Phase 1.

## Goals & non-goals

**Goals**

- **Auto-stage next set on completion.** Remove the `+ Add set` button. Each exercise starts with one pre-staged set; completing a set auto-stages another with the same `weight × reps` and advances the cursor to it. A new header `→ Next` button moves to the next exercise's first set explicitly.
- **Per-exercise rest timer.** Compute the target rest by `exercise.muscle_group` from a lookup table in code; no schema change. Three tiers: 180s (compound), 90s (medium), 60s (isolation).
- **Day-of-week default workout title.** `createWorkout()` defaults to the started_at day name (`'Tuesday'`) instead of `'Workout'`. Tap the title in the header to edit.
- **History demoted from primary nav.** Remove the History tab. Today gains a small `→ history` link in its header chrome. Existing routes (`/history`, `/history/[id]`) remain.
- **Dashed-border cut.** `+ Add exercise` becomes a saffron-text link with a thin hairline, no dashed treatment.
- **`SafeAreaView` import cleanup.** Replace `from 'react-native'` with `from 'react-native-safe-area-context'` everywhere Phase 1 (and any other touched code) pulled the wrong one.
- **Micro size 10 → 12pt.** Update the typography token, ripples through every screen that uses `theme.font.size.micro` automatically.
- **Contrast audit.** Programmatically check `inkTertiary` against `bg` and `surface` in both dark and light palettes; bump if it fails 4.5:1 for normal text.
- **Suppress sync error toasts during active workouts.** `useUpdateSet`, `useAddSet`, `useAddExerciseToWorkout`, `useFinishWorkout` mutations stop calling the `onError` toast handler for sync-class errors when invoked from the active screen. They still toast non-sync errors (e.g. validation).

**Non-goals**

- **Per-user / per-exercise rest timer overrides.** Phase 3 ships the muscle-group defaults only. Custom durations are Phase 4 (Dimensions) or later.
- **Dynamic / smart workout title that updates as exercises are added.** Phase 3 sets the day name on creation and leaves it; user can edit. Auto-deriving from exercise composition is Phase 4.
- **Pull-down / drawer history alternative.** Phase 3 ships the header link only.
- **New ADR for the rest-defaults lookup.** The table lives in a single TS module; if a per-user override later requires schema change, that's the moment for an ADR.
- **A keyboard-replacement custom numeric pad** (was non-goal in Phase 1, still is).
- **Reanimated dep removal** — Phase 1 puts Reanimated to work; it's no longer unused.

## Design

### 1. Auto-stage next set on completion

**Files touched:**
- `src/components/ActiveSetCard.tsx` — remove tap-to-complete fallback (already gone) and update prop interface for the new model
- `src/screens/WorkoutActive.tsx` — change advance logic to auto-stage; remove `+ Add set` footer button; add `→ Next` header button
- `src/components/activeSet.ts` — extend cursor logic for auto-stage semantics
- `src/components/__tests__/activeSet.test.ts` — extend tests

**New behavior:**

When the user completes a set:

1. The mutation marks the current set `completed = true` (existing `useUpdateSet` path — unchanged).
2. Immediately after, the screen calls a new `autoStageNextSet({ weId, copyFrom })` that:
   - Inserts a new empty set for the same `workout_exercise_id` with `weight` and `reps` copied from the just-completed set
   - Returns the new set id
3. Cursor advances to the new set id (not to the next exercise — auto-stage takes priority over `advanceCursor`'s "first set of next exercise" branch).
4. Rest timer starts (existing behavior — unchanged).

**The `→ Next` header button:**

- Position: `headerRight` slot of `Stack.Screen` for the active route, to the left of `SyncIndicator`
- Label: lowercase `next →` in `family.sansMedium`
- Tap: if the current set is unmodified (weight + reps still equal to the staged values, OR both null), advance immediately. Otherwise, Alert: "Skip this set?" Cancel / Skip. On Skip, advance.
- Advance behavior: find the next exercise via `findNextExercise(exercises, cursor.weId)`. If found, set cursor to that exercise's first set (currently exists or first via auto-stage — if the exercise has no sets, create one first using the same `autoStageNextSet` with `copyFrom=null`). If no next exercise, transition to the Finish summary card (cursor = null).
- If the user is on the last exercise's only set, the button label changes to `finish →` and tapping opens the finish summary directly (same as today).

**Label change:**

- `SET 4 OF 5` → `SET 4` (just the number)
- Implemented in `ActiveSetCard.tsx`: remove the `OF {totalSetsInExercise}` portion. The `totalSetsInExercise` prop is removed from the component interface entirely (no longer meaningful).
- Ghost stack already shows running set numbers — that's the running count.

**Edge cases:**

- **First-set-of-exercise:** When a workout starts (via Repeat or template), exactly one set is pre-staged per exercise — current behavior, unchanged. The auto-stage rule only fires on COMPLETION, not on screen mount.
- **First exercise added via `+ Add exercise`:** The existing `addExerciseToWorkout` mutation doesn't auto-stage a set. Update it: after the workout_exercise insert, immediately call `addSet(newWeId)` (existing function). This ensures every exercise always has at least one set ready.
- **Templates with predetermined set counts:** Out of scope. Current templates table doesn't store set count; this remains true.
- **User wants to redo a completed set:** Out of scope for Phase 3. Editing past sets is a Phase 4 item.

### 2. Per-exercise rest timer (muscle-group default)

**Files touched:**
- `src/ui/restDefaults.ts` — new module with the lookup table + pure function
- `src/ui/__tests__/restDefaults.test.ts` — unit tests
- `src/screens/WorkoutActive.tsx` — derive `targetSeconds` from current exercise's `muscle_group`

**Module API:**

```ts
export function restForMuscleGroup(muscleGroup: string | null | undefined): number {
  // 180s — compound, larger muscle groups
  // 90s  — medium (shoulders, arms, calves, generic fallback)
  // 60s  — isolation
}
```

**Lookup table (case-insensitive, trimmed match):**

| Match (lowercase) | Target seconds |
| --- | --- |
| `chest`, `back`, `legs`, `quads`, `hamstrings`, `glutes`, `quadriceps`, `posterior` | 180 |
| `shoulders`, `arms`, `biceps`, `triceps`, `calves`, `traps`, `deltoids` | 90 |
| `core`, `abs`, `obliques`, `forearms`, `grip` | 60 |
| anything else (including null/empty) | 90 |

**Integration in `WorkoutActive.tsx`:**

```ts
const restSeconds = useMemo(
  () => restForMuscleGroup(currentEx?.muscleGroup ?? null),
  [currentEx?.muscleGroup],
);
const timer = useRestTimer({ targetSeconds: restSeconds });
```

The `ExerciseShape` type (in `activeSet.ts`) gains a `muscleGroup: string | null` field. The mapper that converts `WorkoutExerciseWithSets` to `ExerciseShape` reads `we.exercise?.muscle_group`.

**Why no schema change:** Custom per-user rest overrides are out of scope. Computing from existing data eliminates a column, a migration, and sync support.

### 3. Day-of-week default workout title

**Files touched:**
- `src/queries/workouts.ts` — change `createWorkout` default
- `src/lib/dayOfWeek.ts` — new tiny helper (pure function)
- `src/lib/__tests__/dayOfWeek.test.ts` — unit tests
- `src/components/EditableTitle.tsx` — new small inline-editable text component
- `src/components/__tests__/editableTitle.test.ts` — for the pure parts only
- `src/screens/WorkoutActive.tsx` — replace the static `Stack.Screen` title with the editable component

**`dayOfWeek.ts`:**

```ts
export function dayOfWeek(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[d.getDay()]!;
}
```

**Mutation change** (`createWorkout`):

```ts
export async function createWorkout(args: { userId: string; title?: string; templateId?: string | null }): Promise<string> {
  const id = uuidv4();
  const startedAt = nowIso();
  const title = args.title ?? dayOfWeek(startedAt);
  await enqueueMutation({
    table: 'workouts',
    op: 'insert',
    rowId: id,
    payload: { user_id: args.userId, started_at: startedAt, title, template_id: args.templateId ?? null, ended_at: null },
  });
  void triggerPush();
  return id;
}
```

`repeatLastWorkout` already passes the source workout's title; no change.

**EditableTitle component:**

Renders text in `family.sansMedium` at the size matching the nav title style. Tapping enters edit mode (TextInput overlay); blur commits via `updateWorkoutTitle(workoutId, newTitle)` mutation (new — small wrapper around `enqueueMutation` with `op: 'update'` and `payload: { title }`).

Wired into `WorkoutActive.tsx`'s `Stack.Screen` `headerTitle` (instead of the current static title string).

### 4. History demotion

**Files touched:**
- `app/(tabs)/_layout.tsx` — remove the History tab
- `app/(tabs)/history.tsx` — delete
- `app/history/index.tsx` — new index route that lists workouts (the file currently lives at `app/(tabs)/history.tsx`; move its content here)
- `src/screens/Today.tsx` — add the `→ history` header link
- `src/ui/TabIcon.tsx` — remove the `history` case
- `src/screens/History.tsx` — unchanged (was always under `src/screens/`); routes update

**Layout change:**

Tab order becomes: `today`, `progress`, `profile` (3 tabs instead of 4).

Today's header gains a small lowercase text link on the right side: `history →`. Tap routes via `router.push('/history')`. The History index lists workouts (same UX as the deleted tab); tapping a row routes to `/history/[id]` (existing).

**Edge cases:**

- Existing deep links to `/history` (used to be a tab route) still resolve via the new `app/history/index.tsx`.
- The `(tabs)` group's screen options stay; just one fewer screen registered.

### 5. Pure cuts

#### Dashed border on `+ Add exercise`

`src/screens/WorkoutActive.tsx`: the empty-state "+ Add exercise" button and the footer "+ Add exercise" button both currently render with `borderStyle: 'dashed'`. Change to:

```ts
addExercise: {
  padding: theme.space.s3,
  alignItems: 'center',
},
addExerciseText: {
  fontSize: theme.font.size.body,
  color: theme.color.accent,
  fontFamily: theme.font.family.sansMedium,
},
```

A thin hairline above the button stays (matches the divider rhythm used between ghost-stack rows).

#### `SafeAreaView` deprecation

Find all `import { SafeAreaView } from 'react-native'` in Phase 1 / Phase 2 touched files. Replace with:

```ts
import { SafeAreaView } from 'react-native-safe-area-context';
```

Scope: `src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`. The `app/_layout.tsx` `SafeAreaView` is already from the right place.

#### Micro size 10 → 12pt

`src/ui/typography.ts`:
```ts
micro: 12, // was 10 — too small for one-handed gym squinting
```

Cascades to every component that uses `theme.font.size.micro` for labels (Today's `EXERCISE`, `SET 4`, `RECENT`, etc.).

#### `inkTertiary` contrast audit

Run a script (added as `src/ui/__tests__/contrast.test.ts`) that computes WCAG contrast for every `(text-token, background-token)` pair in both palettes:

```ts
// pseudocode in the test
for (const palette of [darkPalette, lightPalette]) {
  for (const inkToken of ['ink', 'inkSecondary', 'inkTertiary', 'inkHero']) {
    for (const bgToken of ['bg', 'surface']) {
      const ratio = contrastRatio(palette[inkToken], palette[bgToken]);
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  }
}
```

`MIN_RATIO = 4.5` for normal text, `3.0` for tertiary (treated as "large text" since it's used for hints).

Bump the failing token's hex if any pair fails. Likely needs adjustment: `inkTertiary` in dark palette (`#5E6862` on `#0F1411`) is ~4.4:1 — just below 4.5. Bump to `#6F7973` (or whatever passes).

#### Suppress sync error toasts during active workout

The mutation hooks (`useUpdateSet`, `useAddSet`, `useAddExerciseToWorkout`, `useFinishWorkout`) currently take an `onError` callback. The active screen passes `toastError`. Change behavior:

Option A (chosen): Add an `isSyncError(err)` helper that pattern-matches against known sync error messages (network, push, supabase). The active screen passes a custom error handler that calls `showToast` only if NOT a sync error. This keeps user-facing errors (validation, exercise-not-found) visible.

Implementation: a `useSyncAwareErrorToast()` hook in `src/ui/ToastContext.tsx` that returns a function for the active screen to use as `onError`.

```ts
function useSyncAwareErrorToast() {
  const { showToast } = useToast();
  return useCallback((msg: string) => {
    if (isSyncError(msg)) return; // SyncIndicator handles it
    showToast(msg, 'error');
  }, [showToast]);
}

function isSyncError(msg: string): boolean {
  const patterns = ['network', 'timeout', 'fetch', 'pushOutbox', 'Failed to fetch', 'ECONN'];
  return patterns.some(p => msg.toLowerCase().includes(p.toLowerCase()));
}
```

`Today.tsx` keeps using `toastError` (it doesn't want this filter — Today's errors are usually user-facing). Only `WorkoutActive.tsx` switches to `useSyncAwareErrorToast`.

### Cross-cutting

- **Test counts:** Phase 3 adds ~15 tests (auto-stage logic, restDefaults, dayOfWeek, contrast audit) for a Phase 3 total of ~96 tests.
- **Sentry breadcrumbs:** No new breadcrumbs; existing Phase 2 ones cover the storage layer.

### File-level changes summary

**New:**
- `src/ui/restDefaults.ts` + tests
- `src/lib/dayOfWeek.ts` + tests
- `src/components/EditableTitle.tsx`
- `app/history/index.tsx` (moved from `app/(tabs)/history.tsx`)
- `src/ui/__tests__/contrast.test.ts`

**Modified:**
- `src/components/ActiveSetCard.tsx` — remove `totalSetsInExercise` prop, label change
- `src/components/activeSet.ts` — `ExerciseShape.muscleGroup` field, `findNextExercise` helper
- `src/components/__tests__/activeSet.test.ts` — extend
- `src/screens/WorkoutActive.tsx` — auto-stage, `→ next` header button, per-exercise rest derivation, EditableTitle, `+ Add exercise` style cleanup, `SafeAreaView` import fix, sync-aware error toast
- `src/screens/Today.tsx` — `→ history` header link, `SafeAreaView` import fix
- `app/(tabs)/_layout.tsx` — remove History tab
- `src/ui/TabIcon.tsx` — remove `history` icon case
- `src/queries/workouts.ts` — `createWorkout` default title; new `updateWorkoutTitle` mutation
- `src/queries/exercises.ts` — `addExerciseToWorkout` auto-stages one set after the workout_exercise insert
- `src/ui/typography.ts` — micro 10 → 12
- `src/ui/colors.ts` — bump `inkTertiary` if contrast audit fails
- `src/ui/ToastContext.tsx` — add `useSyncAwareErrorToast` hook + `isSyncError`

**Deleted:**
- `app/(tabs)/history.tsx`

**Untouched:**
- `src/db/*` (no schema changes)
- `src/sync/*` core
- All Phase 1/2 design tokens (motion, haptics, useTheme structure)
- Other screens (Progress, Profile, Login, TrainingPlan, History)

## Alternatives considered

- **Per-exercise rest with a `rest_seconds` column on `workout_exercises`.** Rejected — adds migration, sync support, and a UI for editing. Phase 3 is about subtraction.
- **Smart workout title from exercise composition.** Rejected — auto-derived titles feel presumptuous and update under the user's feet as they add exercises.
- **Pull-down gesture for History.** Rejected — less discoverable than a header link, conflicts with iOS pull-to-refresh idioms.
- **Keep `+ Add set` for advanced lifters who pre-plan.** Rejected — pre-planning sets is template territory (not currently built), and the auto-stage model serves both cases (just keep going).
- **Increase micro size to 11 instead of 12.** Rejected — 11pt is also too small at arm's length; commit to 12pt.

## Testing

**Unit (Jest):**
- `src/ui/__tests__/restDefaults.test.ts` — every category, case-insensitivity, null/empty fallback (~8 tests)
- `src/lib/__tests__/dayOfWeek.test.ts` — Date / ISO string / epoch ms inputs, all 7 days (~10 tests)
- `src/components/__tests__/activeSet.test.ts` — extend with `findNextExercise` (~3 tests)
- `src/ui/__tests__/contrast.test.ts` — every (ink × bg) pair in both palettes (~16 tests as assertions)

**Integration:**
- `src/__tests__/auto-stage-e2e.test.ts` — complete a set, verify a new set with copied values is in SQLite + outbox; cursor points to the new set id

**Device (manual, in plan):**
- Complete a set on iOS, observe a new set staged with the same values, cursor advances to it
- Tap `→ next` header → confirms via Alert when current set is unmodified, otherwise advances
- Bench Press exercise → rest timer fills over 180s; Tricep Pushdown → over 60s
- Workout created without a title shows "Tuesday" (or whatever day)
- History accessible via Today header link; tapping a workout opens detail
- `+ Add exercise` is a plain saffron text link with no dashed border

## Rollout

Single-developer, single-user app. No production traffic. No feature flag. Sequenced commit history; each gates on `npm run typecheck && npm run lint && npm test`:

1. `restForMuscleGroup` module + tests
2. `dayOfWeek` helper + tests
3. `findNextExercise` helper + tests (in activeSet.ts)
4. Contrast audit test (will fail on first run if `inkTertiary` is below; fix in next commit)
5. Bump `inkTertiary` (if needed) + micro 10 → 12
6. `addExerciseToWorkout` auto-stages one set
7. `createWorkout` default title = dayOfWeek
8. `updateWorkoutTitle` mutation + `EditableTitle` component
9. `useSyncAwareErrorToast` hook + `isSyncError` helper
10. WorkoutActive integration: auto-stage on completion, `→ next` button, per-exercise rest, EditableTitle, sync-aware errors, SafeAreaView fix, dashed border cut, label change
11. Today header `→ history` link + SafeAreaView fix
12. Remove History tab from `app/(tabs)/_layout.tsx` + TabIcon; move `app/(tabs)/history.tsx` → `app/history/index.tsx`
13. Spec status flip to `implemented`

13 commits. Each independently reviewable.

## Open questions

- **Does `findInitialCursor` in `activeSet.ts` need updating for the auto-stage model?** Probably no — it already finds the first non-completed set. With auto-stage, that's always the last set in the exercise (since completed ones are behind). Verify during implementation.
- **Should the `→ next` confirmation Alert appear when weight/reps differ from staged but `completed: false`?** Plan says yes (Alert "Skip this set?"). Verify on device; if too friction-heavy, downgrade to immediate advance.
- **What happens if the user discards a workout via the CollisionSheet that has an auto-staged but uncompleted set?** Same as discarding any other workout — soft-delete cascades. No new behavior needed.
