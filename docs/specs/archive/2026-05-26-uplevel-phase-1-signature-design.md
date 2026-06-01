# Uplevel Phase 1 — Signature

- **Status:** implemented
- **Date:** 2026-05-26
- **Related ADRs:** none new; respects [ADR-0001](../adr/0001-sqlite-as-source-of-truth.md) (SQLite source of truth)

## Problem

FlexYug today is a well-mannered indie strength tracker built on a genuinely strong local-first architecture. The visible product is *good but anonymous*: a header row + spreadsheet of `Set / Weight / Reps / Done` indistinguishable at 10 paces from Strong, Hevy, FitNotes, and a dozen others. There is no on-screen element a person would screenshot and recognize as Vyayamy.

The 2026-05-26 design audit (in this conversation) named three highest-leverage moves to close the gap from "good app" to a piece of software a designer would screenshot:

1. Build a **signature on-screen object** — the active set is the product; treat it like one.
2. **Default home to "Repeat last workout"** — collapse the dominant path from ~10 taps to 1.
3. **Earn a typeface** — system SF Pro is the single biggest "this is iOS default" tell on the app.

Phase 1 ships these three moves together with the aesthetic direction (**brutalist lifter**: dark-first, monospace-driven, hairline-ruled) and one paired typeface system (**Geist Mono + Geist Sans**) that anchors them. Phases 2–4 (Trust, Restraint, Dimensions) follow in subsequent specs.

## Goals & non-goals

**Goals**

- Replace the current `SetsTable`-based active-workout screen with a single **Active-Set card** that owns the visible area: exercise name, a hero 82pt Geist Mono `weight × reps`, ghost stack of completed sets, swipe-up completion.
- Replace the current Today "Start a workout" empty card with a **Repeat last workout** primary card that pre-fills the first exercise's exact same weight/reps and routes straight into the Active-Set screen.
- Adopt **Geist Sans + Geist Mono** as the project's type system; remove default-system reliance.
- Adopt the **brutalist lifter** color system (dark + light token sets, designed as a coherent pair, system-mode-following).
- Define and use **motion and haptics deliberately**: motion earned in exactly three places, haptics refined to a smaller, more meaningful set.
- Maintain the existing local-first write path — all changes are presentation/interaction; the mutation layer (`src/db/mutations.ts`, `src/sync/*`, `src/queries/*`) is untouched. The new screens consume the same React Query hooks and `enqueueMutation` primitive.

**Non-goals**

- **Autosave on keystroke** — typed-but-uncommitted weight/rep loss is real but is Phase 2 (Trust). Phase 1 keeps the existing on-blur commit pattern.
- **Workout-collision detection, quarantined-outbox UI, cold-start snapshot** — Trust (Phase 2).
- **Removing the History tab from primary nav, removing the "+ Add set" button, removing the dashed border on "+ Add exercise", removing unused Reanimated** — Restraint (Phase 3).
- **Adjusting the sync indicator, expanding line-height tokens, sync diagnostics sheet** — Dimensions (Phase 4).
- **A keyboard-replacement custom numeric pad.** Steppers + system keypad fallback is the chosen path; a fully custom pad is future polish.
- **Per-exercise rest timer durations.** Phase 1 keeps the 90s default; per-exercise tuning is Restraint.
- **Sound design.** Out of scope entirely for now.
- **Onboarding / first-run tutorial / seeded sample data.** Empty-state copy is improved but no onboarding flow is built.

## Design

### Aesthetic direction: brutalist lifter

A committed, dark-first design language characterised by:

- Single dominant content object per screen (the Active-Set card is the screen).
- Monospace-driven information density. Numbers are large, deliberate, and tabular.
- Hairline rules over fills. Borders carry the layout; no card shadows, no gradients.
- All-lowercase for narrative chrome (titles, navigation); UPPERCASE + 1.5px tracking for micro labels (`EXERCISE`, `SET 4 OF 5`, `TARGET`).
- Restraint as a feature. Motion is earned in three places, nowhere else.

The same direction has a coherent **light-mode counterpart**: chalk-on-paper inverse — warm cream (`#F4F1EB`) background, ink (`#1A1F1C`) text, the same hairline + monospace + lowercase rules — designed as a single coordinated system, not as a token-swap of the dark mode.

### Color system

Replace the current `src/ui/theme.ts` palette. Single source of truth: a `lightColors` and `darkColors` object plus a `useThemeColors()` hook that returns the active set based on `useColorScheme()`. Existing consumers reference `theme.color.X`; refactor to use the hook so theme follows system.

**Dark mode (default-feeling):**

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0F1411` | Screen background (oxide near-black) |
| `surface` | `#161B18` | Cards, raised surfaces |
| `border` | `#1A2420` | Hairlines, dividers |
| `borderStrong` | `#1F2925` | Card outlines |
| `ink` | `#C9D4CC` | Body text |
| `inkSecondary` | `#8C9A92` | Secondary text |
| `inkTertiary` | `#5E6862` | Tertiary, placeholder |
| `inkHero` | `#E8F0EA` | Hero numerals only |
| `accent` | `#6DA37E` | Stepper chevrons, completion ring, sync-online dot, rest-bar fill |
| `accentSoft` | `rgba(109, 163, 126, 0.12)` | Active set highlight |
| `success` | `#6DA37E` | Same as accent (no separate green) |
| `danger` | `#C76B58` | Errors (warm rust, not jarring red) |
| `dangerSoft` | `rgba(199, 107, 88, 0.12)` | Error pill backgrounds |
| `onAccent` | `#0F1411` | Text on accent fill |

**Light mode (warm-paper inverse):**

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#F4F1EB` | Screen background (warm cream) |
| `surface` | `#FFFFFF` | Cards |
| `border` | `#E5DFD3` | Hairlines |
| `borderStrong` | `#D6CFC0` | Card outlines |
| `ink` | `#1A1F1C` | Body text |
| `inkSecondary` | `#5A625C` | Secondary text |
| `inkTertiary` | `#9CA39E` | Tertiary, placeholder |
| `inkHero` | `#0A0E0B` | Hero numerals only |
| `accent` | `#3D6E52` | Darker green for contrast on cream |
| `accentSoft` | `rgba(61, 110, 82, 0.10)` | Active set highlight |
| `success` | `#3D6E52` | Same as accent |
| `danger` | `#8A4030` | Darker rust |
| `dangerSoft` | `rgba(138, 64, 48, 0.10)` | Error pill backgrounds |
| `onAccent` | `#FFFFFF` | Text on accent fill |

The **brand** color (saffron `#E05A2C` from the old palette) is removed from the working theme. Saffron stays only on the logo mark and is reserved for the splash screen. The new accent green carries primary affordances. This is a deliberate retreat from "brand-color-as-garnish" — the language is the accent, not the logo.

### Typography system

Add Geist Sans + Geist Mono via `expo-google-fonts/geist` and `expo-google-fonts/geist-mono`. Load both at app boot (already a pattern in `app/_layout.tsx` for splash control). Remove all reliance on default system font.

**New `theme.font`:**

```ts
export const font = {
  family: {
    sans: 'Geist',         // Maps to Geist_400Regular, etc.
    mono: 'GeistMono',     // Maps to GeistMono_400Regular, etc.
  },
  size: {
    hero: 82,              // The set number (Active-Set card)
    display: 28,           // Today greeting title
    title: 20,             // Exercise name
    body: 14,              // Body copy
    meta: 12,              // Secondary
    micro: 10,             // UPPERCASE tracked labels
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  tracking: {
    hero: -3.5,            // Hero numerals
    title: -0.3,           // Titles
    body: 0,               // Body
    micro: 1.5,            // UPPERCASE micro labels (positive tracking)
  },
  lineHeight: {
    hero: 0.92,            // Tight for big numerals
    title: 1.2,
    body: 1.4,
    meta: 1.6,
  },
}
```

**Rules:**

- **All numerals** (weights, reps, set counts, timer values, history meta) use `family.mono` with `fontVariant: ['tabular-nums']`.
- **All chrome and narrative copy** (exercise names, screen titles, button labels, empty-state body) use `family.sans`.
- **Titles** are mixed case (e.g. "Bench Press", "Push · Tuesday"). **Micro labels** (`EXERCISE`, `SET 4 OF 5`, `RECENT`) are UPPERCASE with `tracking.micro`.
- **Nav titles** are lowercase (e.g. "today", "push · tuesday") in `family.sans` `weight.medium`. This is a small, deliberate brutalist tell.

### Today screen

Replace `src/screens/Today.tsx` content. New layout, top to bottom:

1. **Time-of-day greeting** in micro label style (`MONDAY MORNING`).
2. **"Ready to lift." / "Workout in progress."** in `display` size, `weight.semibold`.
3. **State precedence** (only one of the cards below renders, in priority order):
   - **Active workout in progress** (`ended_at IS NULL`) → render the **Resume card** (CTA `→ Resume workout`, restyled).
   - **No active, has a last completed workout** → render the **Repeat card** (see below).
   - **No active, no last workout** (true first launch) → render an empty Repeat-slot card with body `Your first workout will live here.`

**Repeat card** (rendered when there is a last completed workout and no active one):
   - Top label: derived title (e.g. `PUSH · DAY 1`) — currently the workout's `title` field, falling back to "WORKOUT" if blank. (Smart derivation of titles from exercise list is Phase 4.)
   - Subtitle: exercise list summary (up to 4 exercises shown as `Bench Press · 185 × 5`, each line). Uses last set per exercise.
   - CTA row: `→ Repeat workout` in accent color.
   - Tappable as a single hit area. Tap → `repeatLastWorkout()` mutation creates a new workout with the same exercises in the same order, each exercise pre-seeded with one new empty set whose `weight` and `reps` are copied from the most-recent *completed* set of that exercise in the previous workout. Router pushes `/workout/active`.
4. **Secondary row**: two equal-weight buttons, `+ Blank` and `Templates`. Blank does today's existing behavior. Templates routes to the existing templates surface (no change in Phase 1; this just makes it discoverable from home).
5. **`RECENT`** section header (micro label), then last 3 workouts as one-line rows: name (Geist Sans medium), `4 days · 14 sets` meta (Geist Mono, dim).

The greeting + title bar replaces the existing top of the Today screen. The Recent list stays; styling updates to the new tokens.

### Active-Set screen

Replace `src/screens/WorkoutActive.tsx` content. The new screen is **one card at a time**. The conceptual model:

- A workout has an ordered list of exercises.
- Each exercise has an ordered list of sets, with a planned `targetReps` and pre-filled `weight` (from previous performance or template).
- At any moment, exactly one set is **active** (the one being lifted). All prior sets in the current exercise are **completed** or **skipped** (ghost-stacked below). All future sets in the current exercise are not yet on screen (revealed one at a time as user advances).
- The screen renders the active set as the hero card. Completion advances to the next set within the same exercise; the last set of an exercise advances to the next exercise's first set; the last set of the last exercise opens the "Finish workout" sheet.

**Card anatomy (top to bottom):**

```
RestProgressBar              (2px line at very top of screen, fills as rest elapses)
StatusBar / NavBar           (back, lowercase title "push · day 1", sync dot)
─── card ───
EXERCISE 1 OF 4              (micro, mono, 1.5px tracking, ink-tertiary)
Bench Press                  (title, sans, semibold, ink)
SET 4 OF 5                   (micro, mono, 1.5px tracking, ink-tertiary)
185 × 5                      (hero, mono, ink-hero, -3.5 tracking, 82pt)
TARGET · 5 REPS @ RPE 8      (micro, sans, ink-secondary)   [shown if target exists; hidden otherwise]
─── divider ───
SET 1  135 × 8        ✓      (ghost stack of completed sets, mono dim)
SET 2  175 × 5        ✓
SET 3  185 × 5        ✓
─── (filler / spacer) ───
↑ Swipe up to complete       (sans body, ink-tertiary, centered above tab bar)
```

**Stepper interaction:**

- Tapping the weight portion of `185 × 5` focuses *just* the weight. Reps dim to 55% opacity. Two chevrons (▲ ▼) appear above and below the weight in accent color. Below the weight, a unit label (`LB` / `KG`) appears.
- ▲ = +1 plate (5 lb default, 2.5 kg if metric, configurable per exercise as Phase 3 work — Phase 1 uses a global default from user profile units field).
- ▼ = −1 plate.
- Long-press a chevron = ramp acceleration (5 lb every 200ms after a 600ms hold).
- A subtle hint line replaces `TARGET · …` while focused: `+5 LB · TAP NUMBER FOR KEYPAD` in accent.
- Tapping the *number* itself (not the chevrons) opens the system numeric keypad with the current value selected.
- Tapping outside the stepper area defocuses and reverts to the idle state.
- Same pattern for reps (chevrons = ±1 rep, no plate-jump notion; unit label "REPS").

**Swipe-up completion:**

- Implement using `react-native-gesture-handler` (already in `package.json`) + `react-native-reanimated` (also already in `package.json`, currently unused — this is the productive use).
- Card is wrapped in a `PanGestureHandler` with a `useAnimatedStyle` `translateY`.
- Vertical drag tracks finger 1:1 up to a 60px threshold; beyond threshold, the card snaps to threshold (rubber-band overshoot) and the bottom-of-screen target shows `✓ RELEASE TO COMPLETE` filled with `accentSoft`.
- Crossing the threshold triggers `Haptics.impactAsync(Rigid)`. Crossing back below triggers nothing (no haptic spam on rebound).
- On release **above** threshold:
  - Fire `light` for routine sets / `medium` for last set in exercise (see Haptics section).
  - Card animates out via `withSpring(motion.spring.snappy)` (translates off-screen, target `translateY = -screenHeight`).
  - Mutation: `updateSet({ setId, weId, patch: { completed: true } })` — same code path as today.
  - Rest timer starts (`useRestTimer.start()`).
  - Next-set card mounts at `translateY = screenHeight` and animates to 0 via `withSpring(motion.spring.settle)`.
  - Ghost stack grows by one row.
  - Spring perceptual duration is ~250–350ms depending on damping/stiffness; do not pass an explicit `duration`. The motion tokens fix the feel.
- On release **below** threshold: card returns to rest with `withSpring(motion.spring.rebound)`, no mutation, no haptic.
- Downward swipe is ignored (no accidental "uncomplete" — that's a destructive action; reachable via tapping a ghost-stack row, scope Phase 3).

**Navigation between sets and exercises:**

- "Next set" auto-advances on completion as described above.
- "Skip remaining sets and advance to next exercise" — header-right button (chevron-down icon, `→ Next exercise`). Confirms via Alert ("Skip remaining 2 sets?"). Phase 1.
- "Back to previous set" — header-left back button is currently the screen-pop. Add a second back affordance? **No** — Phase 1 only forward-advances. Editing past sets is done via tapping the ghost-stack row (opens an edit sheet — Phase 1 scope: read-only ghost rows; edit via long-press is Phase 3).
- "Finish workout" — after the last set of the last exercise completes, the next-set slide-in is replaced by a **Finish summary card** showing volume, sets done, time, and a `→ Finish workout` button. Tap = `finishWorkout` mutation + route to Today.

**Empty state — exercise has no sets yet:**

A new exercise added to a workout starts with one empty set (`weight: null, reps: null`). The card renders with `– × –` in `ink-tertiary` and the stepper opens with default values from previous performance (if known) or `135 × 5` / `45 × 8` defaults if not. The swipe-up gesture is disabled until both `weight` and `reps` are non-null.

**Empty state — workout has no exercises yet:**

The card is replaced with a centered `Add your first exercise` body line and a `+ Add exercise` button in accent color. Picker behavior unchanged (uses existing `ExercisePicker`).

### Rest timer

Replace the existing dark pill at the top of the active-workout screen with a **2px horizontal progress bar** anchored to the very top of the screen (above the status bar background, beneath the notch).

- Hidden when timer not running (height: 0, no layout shift).
- When `timer.running`, fill width animates from 0% → 100% over `targetSeconds` (default 90).
- Fill color: `accent` (oxide green). At 100% complete, color shifts to `accent` with a brief 1× opacity pulse (300ms).
- Haptic on completion: `Haptics.notificationAsync(Success)` — unchanged from today.
- The number value (e.g. `1:23`) is not displayed by default. **Tapping** the rest bar anywhere expands it for 2 seconds into a thin overlay showing `1:23 / 1:30` in mono, then collapses. (Phase 1 implements the tap-to-show; the bar itself is the primary signal.)
- `Skip rest` is reachable by long-pressing the bar (haptic Light, immediate stop).

### Motion system

Define and *use sparingly* in `src/ui/motion.ts`:

```ts
export const motion = {
  spring: {
    snappy:    { damping: 22, stiffness: 240 },   // Card lift, swipe-up complete
    settle:    { damping: 22, stiffness: 200 },   // Next-set slide-in
    rebound:   { damping: 18, stiffness: 280 },   // Below-threshold swipe return
  },
  duration: {
    fast: 150,
    base: 220,
    slow: 320,
  },
}
```

Motion is **only** used in three places in Phase 1:

1. **Set completion** — card lift, swipe-up commit, next-set slide-in (as described above).
2. **Workout finish** — volume / set count counter tallies up over 600ms ease-out. No confetti. Then a quiet hold.
3. **Exercise picker** — slide-up via `withSpring(motion.spring.settle)`. Tactile, not bouncy.

Everything else has zero motion (no tab transitions, no input-focus animations, no fade-ins on screens). This is the brutalist commitment.

### Haptic system

Replace the current ad-hoc usage with a small `src/ui/haptics.ts` wrapper:

```ts
export const haptics = {
  light:    () => Haptics.impactAsync(Light).catch(() => {}),
  medium:   () => Haptics.impactAsync(Medium).catch(() => {}),
  rigid:    () => Haptics.impactAsync(Rigid).catch(() => {}),
  success:  () => Haptics.notificationAsync(Success).catch(() => {}),
};
```

Triggers in Phase 1:

| Trigger | Type | Where |
| --- | --- | --- |
| Stepper increment (single tap) | `light` | Active-Set card stepper |
| Stepper ramp tick (during long-press) | `light` (throttled to 200ms) | Active-Set card stepper |
| Swipe-up crosses completion threshold | `rigid` | Active-Set card pan handler |
| Set completed (routine — not last in exercise) | `light` | After mutation, before next-set slide |
| Set completed (last set in exercise) | `medium` | Higher-weight moment |
| Rest timer reaches target | `success` | `useRestTimer.ts` (existing) |
| Long-press to skip rest | `light` | Rest bar handler |

The existing `Heavy` on long-press-to-delete-set is preserved (file `SetsTable.tsx:120` — when SetsTable is removed in this phase, that haptic moves to the ghost-stack edit interaction which is Phase 3; for Phase 1 the destructive-haptic line is removed without replacement).

### Compatibility strategy for non-Phase-1 screens

Phase 1 touches the theme tokens (`src/ui/theme.ts`) and only rebuilds two screens (`Today.tsx`, `WorkoutActive.tsx`). Other screens (`History.tsx`, `HistoryDetail.tsx`, `Progress.tsx`, `Profile.tsx`, `TrainingPlan.tsx`, `Login.tsx`, the sync indicator, etc.) reference the existing `theme.color.brand`, `theme.color.pr`, `theme.color.accentSoft`, etc. Touching the tokens would visually break them.

Resolution: **the new theme is additive**. The new tokens (`bg`, `surface`, `ink`, `inkHero`, `accent`, etc., as defined in the Color system tables above) live in `src/ui/colors.ts`. The existing `src/ui/theme.ts` color object stays exactly as it is for Phase 1 and is mapped via a small compatibility shim — each old token (`brand`, `pr`, `accentMuted`, `successSoft`, etc.) resolves to the closest new token in the active theme (light or dark). The non-Phase-1 screens render in the new palette automatically via the shim, but they're not re-laid-out — that's a Phase 3/4 sweep.

In practice this means:
- `src/ui/theme.ts` is kept as the public import path for the rest of the app.
- Internally, `theme.color` becomes the result of `useTheme()` (which reads `useColorScheme()` and returns the right token set).
- A small `legacyColorMap` table maps old token names to new ones (e.g. `brand → accent`, `pr → accent`, `successSoft → accentSoft`, `chartAxis → inkTertiary`).
- Today and Active-Set use the new tokens directly via the new theme structure.

This keeps the migration single-developer-tractable while still letting the visual diff on the non-Phase-1 screens preview what the new aesthetic feels like.

### File-level changes (this spec, not the plan)

- **New:** `src/ui/colors.ts` (palette tokens — light + dark sets), `src/ui/typography.ts` (font scale), `src/ui/motion.ts`, `src/ui/haptics.ts`, `src/ui/useTheme.ts` (color hook reading `useColorScheme()`).
- **New:** `src/components/ActiveSetCard.tsx`, `src/components/RepeatCard.tsx`, `src/components/RestProgressBar.tsx`, `src/components/NumericStepper.tsx`.
- **Refactored:** `src/ui/theme.ts` — internally restructured to delegate to the new files via `useTheme()`; external API surface (`theme.color.X`, `theme.space.X`, `theme.font.X`) stays compatible via the legacy color map.
- **Replaced:** `src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`.
- **Removed in this phase:** `src/components/SetsTable.tsx`, `src/components/ExerciseBlock.tsx` (subsumed by ActiveSetCard).
- **New queries:** `useRepeatLastWorkout(userId)` and `useLastFinishedWorkout(userId)` in `src/queries/workouts.ts` (read-side); `repeatLastWorkout(userId)` mutation that creates a new workout cloning exercises + last set values.
- **Untouched:** all of `src/db/*`, `src/sync/*`, `src/queries/keys.ts`, mutation primitives, schema, ADRs, and all non-Phase-1 screens (`History`, `HistoryDetail`, `Progress`, `Profile`, `TrainingPlan`, `Login`).

## Alternatives considered

- **Keep the SetsTable model and just restyle.** Rejected — the spreadsheet is the single biggest reason the app reads as anonymous. Tweaking colors and fonts on top of it leaves the headline problem intact.
- **Berkeley Mono ($75 paid license).** Considered and recommended in brainstorming. User chose Geist Mono (free) for first pass. Spec leaves room to swap to Berkeley later by isolating font references behind `theme.font.family`.
- **Cathedral aesthetic (pure black + oxblood + serif).** Considered, rejected — too reverent for a gym app whose context is sweaty, distracted, glance-able. Brutalist lifter retains the dark-first commitment with less drama.
- **Tap-only completion (no swipe).** Considered. Rejected because tap is too easy to misfire and not distinctive. Swipe is the signature gesture.
- **Progressive-overload suggestions on "Repeat".** Rejected — too opinionated; honest "exact same as last time" lets the lifter decide progression.
- **Build new screens behind a feature flag, ship dual-track.** Rejected — single solo user (the developer), no production traffic to protect, no value in dual-tracking. Cleaner to replace.

## Testing

**Unit (Jest, existing setup):**

- `src/components/__tests__/NumericStepper.test.tsx` — increment/decrement, long-press ramp, focus/blur, edge cases at 0 and at large values.
- `src/components/__tests__/RestProgressBar.test.tsx` — render width based on `elapsed / targetSeconds`, hides when not running.
- `src/queries/__tests__/repeatLastWorkout.test.ts` — clones exercises in order, copies last completed set values, handles workouts with no completed sets (empty seeds), handles user with no prior workouts (returns null).

**Integration (Jest with `better-sqlite3` mock, existing pattern):**

- `src/__tests__/repeat-flow.test.ts` — create workout A with sets, finish it, run `repeatLastWorkout`, verify new workout has the right exercises + seeded sets, verify outbox has the right operations.
- `src/__tests__/active-set-advance.test.ts` — complete a set, verify next-set state machine advances correctly within and across exercises.

**Device (manual, in spec — captured as a checklist for verification):**

- Swipe-up gesture feel on physical iPhone (response, haptic timing, spring).
- Rest progress bar visibility at arm's length under bright/dim conditions.
- Stepper ramp acceleration on long-press.
- Theme switching live by toggling iOS dark mode.

## Rollout

Single-developer, single-user app. No production traffic. No feature flag. Sequenced commit history:

1. **Foundation** — add fonts (Geist + Geist Mono), new color tokens, new typography tokens, new motion + haptic wrappers, `useTheme` hook. App still uses old screens; visual diff is zero. Verifies the foundation loads cleanly.
2. **Today screen rebuild** — new `Today.tsx` with greeting + Repeat card + Recent list using new tokens. Old `WorkoutActive` still runs when navigated to (uses old tokens — visual mismatch is acceptable for one commit).
3. **Active-Set card scaffold** — new `ActiveSetCard` component, new `WorkoutActive.tsx` rendering one card at a time without the swipe gesture yet (tap-to-complete fallback for one commit only).
4. **Stepper + keypad** — `NumericStepper` component wired into `ActiveSetCard`.
5. **Swipe-up gesture + spring** — replace tap-to-complete with the gesture. Verifies on device.
6. **Rest progress bar** — replace the old timer pill.
7. **Motion + haptic polish** — finish workout counter tally, exercise picker spring, refined haptic triggers.
8. **Delete `SetsTable.tsx`, `ExerciseBlock.tsx`, and the old timer card code.** Status flips to `implemented`.

Each step lands as a commit with a passing test suite. The app is usable at every step.

## Open questions

- **What's the unit default?** The `profiles.units` column already exists in the schema; user profile can be `kg` or `lb`. Stepper increment defaults: `5 lb` if lb, `2.5 kg` if kg. Confirmed assumption.
- **What if the last workout has *no* completed sets** (workout was started and immediately finished, or all sets were skipped)? Repeat card still renders with the same exercises but with placeholder seeds (`– × –`, opens stepper at `135 × 5` default). Confirmed assumption.
- **What if the user has multiple workout types on a rotation (Push / Pull / Legs)** and the "last workout" is the wrong one? Phase 1 ignores this; the Repeat card always shows "most recent". Smart rotation detection is a Phase 4 / future-spec topic.
- **Does the swipe-up gesture conflict with vertical scrolling of the ghost stack?** The active card itself is fixed; only the ghost stack scrolls. Pan handler only activates on the card area, not the ghost stack. Verified at design time; verify on device during step 5.
