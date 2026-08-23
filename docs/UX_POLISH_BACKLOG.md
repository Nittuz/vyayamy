# FlexYug UX Polish Backlog

Date: 2026-06-10. Baseline: main @ `c8412ae` (439/439 tests green, tsc clean, eslint 0 errors).

Scope: every UX-facing item still OPEN or DEFERRED after the 16-dimension deep review (2026-06-09/10) and the ~33 Phase 0-4 fix commits merged to main. Items already fixed on main are excluded. Sync, infrastructure, schema, and testing-only items live in the repo review, not here; they appear below only where they surface in the UI. Sources: the verified findings set (finding numbers carried per item), plus the 2026-06-10 post-fix journey re-rating, four-skin verification, and naming/copy sweep, all read against current main. New items discovered by those sweeps are tagged `new`.

Priorities: P0 ship-blocker (none open), P1 broken or data-losing path in a core journey, P2 daily-felt friction, P3 polish and consistency.

---

## Resolution log — Forged Iron redesign (2026-06-12, branch `redesign/forged-iron`)

The "Forged Iron" visual + experiential uplevel resolved or advanced the items below. Each remaining open item keeps its full entry further down.

- **Resolved:** 1.4 (leave-set confirm only when edited), 2.1 (voice error no longer renders as success), 3.1 (rest timer is now a mono `m:ss` countdown with a 44pt skip, not a 2px hairline), 7.1 (`<Text variant>` migration completed across screens), 7.2 (legacy static-StyleSheet screens — Today, WorkoutActive — moved to `makeStyles`), 7.3 (one `Sheet`/`ConfirmSheet` primitive replaces the five divergent modals; `Alert.alert` decisions migrated), 7.4 (light/dark splash + iOS 18 light/dark/tinted icon variants + ember notification color), 7.5 (TabIcon consumes `focused`), 8.2 (Today empty state is a start CTA; Login leads with magic-link + sent-state recovery), 8.4 (Quarantine "Discard all" gated behind a destructive confirm), 10.1 (live PR detection fires the glow/pill/recap).
- **Partially resolved:** 1.5 (next/finish moved to a thumb-zone bottom bar), 7.6 (contrast suite extended with accent/danger/onAccent/surface2 pairs), 7.7 (BootOverlay resolves palette by scheme), 9.1 (VoiceOver complete-set accessibility action added; full device QA still open), 9.3 (44pt audit applied on touched controls).
- **Superseded:** the four-skin system and the brand-medal items — the skin picker was retired for a single Forged Iron identity, and the rose-gold medal was replaced by the "loaded-end" mark with new store assets.
- **Still open** (not in redesign scope): 1.2, 1.3, 6.1, 8.1 (partial), 8.3.
- **Resolved by the set-entry redesign (2026-07-19 spec, branch `set-entry-redesign`):** 9.3/#27 (stepper touch targets now ≥44pt), 7.5/#30 (▲▼ glyphs → Icon registry ±), 9.2/#117 (stepper Dynamic Type via Text variants), 2.2/#137 (voice values clamped), plus the new-in-review set-entry defects (wipe-on-blur, mid-typing commits, lb decimals, locale comma, voice empty-set completion, EditSetSheet save race). Bodyweight sets are now loggable (reps-only gate). Known follow-ups: voice-added exercises don't history-prefill (needs FirstSetStage plumbed through useVoiceSession — see src/voice/dispatch.ts comment); the LOG SET bar reflects committed values while a keypad is open (accepted edge, see TESTING.md QA rider); the voice echo renders '-' instead of BW for weightless sets (route it through setValuesLabel with the same plumbing).
- **Resolved by the history-correction spec (2026-08-22, `docs/specs/2026-08-22-history-correction-spec.md`):** 1.1 (banked sets are correctable — HistoryDetail rows are now pressable and open `EditSetSheet` to edit or delete a set, gated behind a destructive confirm for a finished set; a ghost-destructive "Delete workout" action removes the whole workout; both paths recompute PRs afterward, so a fat-fingered weight no longer stands forever). HistoryDetail is no longer render-only.

---

## 1. Core workout flow

**1.1 Banked sets cannot be corrected (new: journey 6 re-rating)**

- Priority: P1
- Screen or flow: WorkoutActive ghost rows, HistoryDetail
- Problem: once a set is banked there is no path to edit, un-complete, or delete it: ghost rows are non-interactive `View`s (`ghostList` in `src/components/ActiveSetCard.tsx`), `src/screens/HistoryDetail.tsx` is render-only, and `useDeleteSet`/`useAddSet` in `src/queries/sets.ts` have zero UI consumers (grep verified).
- Recommended improvement: make ghost rows tappable, opening a small edit sheet (weight, reps, delete) backed by the existing `useUpdateSet`/`useDeleteSet`; add the same row action to HistoryDetail; after any edit, recompute PRs for that exercise via the authoritative recompute in `src/queries/personalRecords.ts` so a corrected typo also corrects the PR.
- Expected user impact: removes the most common data-integrity dead end in daily logging; also the recovery path for typo weights (#137), since voice "undo" only reverts the immediately preceding voice command (`dispatchCommand` undo closures in `src/voice/dispatch.ts`).
- Implementation notes: design inside the Sheet primitive if item 7.3 lands first, otherwise standalone; cover the un-complete transition with a unit test; the only path that sets `completed: false` on an existing set is the voice undo closure in `src/voice/dispatch.ts`, so no UI path exercises it today.
- Files likely involved: `src/components/ActiveSetCard.tsx`, `src/screens/HistoryDetail.tsx`, `src/queries/sets.ts`, `src/queries/personalRecords.ts`, `src/screens/WorkoutActive.tsx`

**1.2 CollisionSheet is a blocking modal that forces destruction of a real workout (#111)**

- Priority: P1
- Screen or flow: Today, two-active-workouts anomaly
- Problem: `src/components/CollisionSheet.tsx` is a Modal with no cancel or dismiss, and resolving it permanently discards one of two real workouts.
- Recommended improvement: make it dismissable and show a persistent banner (the QuarantineBanner pattern) until resolved; change Resume to mark the other workouts finished (set `ended_at`) so no sets are lost; keep explicit Discard behind a confirmation step.
- Expected user impact: removes the only flow where the app forces data loss; the anomaly is reachable via two-device sync, not just bugs.
- Implementation notes: small scope; pairs naturally with the Sheet primitive (7.3) but does not depend on it.
- Files likely involved: `src/components/CollisionSheet.tsx`, `src/screens/Today.tsx`, `src/queries/workouts.ts`

**1.3 ExercisePicker dead-ends on no results; create-exercise is voice-only (#31; journey 17)**

- Priority: P1
- Screen or flow: WorkoutActive, add exercise
- Problem: a typed search for an unknown exercise renders an empty FlatList with no CTA; `createCustomExercise` (`src/queries/exercises.ts`) is reachable only through the voice fallback (`addExercise` case in `src/voice/dispatch.ts`), and `src/components/ExercisePicker.tsx` has no `ListEmptyComponent` or create row (grep verified).
- Recommended improvement: add a `ListEmptyComponent`: when the query is non-empty, a pressable row `+ Create "{query}"` calling `useCreateCustomExercise` then `onPick(id)`; when both query and library are empty, one calm explainer line.
- Expected user impact: closes a journey rated FRICTION P1; roughly 30 lines.
- Implementation notes: none; pure additive UI over existing mutations.
- Files likely involved: `src/components/ExercisePicker.tsx`, `src/queries/exercises.ts`

**1.4 Finishing always interposes a destructive "Skip this set?" alert (new: journey 11 re-rating; touches #26, #76)**

- Priority: P2
- Screen or flow: WorkoutActive, finish
- Problem: the auto-staged next set copies weight and reps from the set just completed, so `isUnmodified` in `onNextExercise` (`src/screens/WorkoutActive.tsx`) is always false and every natural finish passes through the OS `Alert.alert('Skip this set?', ...)`.
- Recommended improvement: track an `is_auto_staged` flag (or compare against the seeded values rather than null) so an untouched auto-staged set counts as unmodified and is pruned silently, the way `finishWorkout` (`src/queries/workouts.ts`) already prunes dangling auto-staged sets (#12); keep the confirm only when the user actually edited values.
- Expected user impact: finish drops from 3 taps to 2, and the end of every workout stops feeling like an error state.
- Implementation notes: when 7.3 lands, the residual confirm becomes a `ConfirmSheet` instead of the app's lone `Alert.alert` (#76).
- Files likely involved: `src/screens/WorkoutActive.tsx`, `src/queries/workouts.ts`

**1.5 Primary in-workout navigation sits out of the thumb zone (#116)**

- Priority: P2
- Screen or flow: WorkoutActive header; Today; QuarantineSheet
- Problem: next/finish lives in the top-right header, the hardest reach during one-handed gym use, and several adjacent targets on Today and QuarantineSheet are under 44pt.
- Recommended improvement: move next/finish into a bottom action row on WorkoutActive (Voice and Add exercise are already there) and apply `minHeight: theme.touch.min` to the listed sub-44pt Pressables.
- Expected user impact: the most-tapped in-workout control becomes reachable mid-set with one hand.
- Implementation notes: needs simulator QA for the new bottom-row layout; overlaps the #27 touch-target audit (section 9.3), land them together.
- Files likely involved: `src/screens/WorkoutActive.tsx`, `src/screens/Today.tsx`, `src/components/QuarantineSheet.tsx`

**1.6 Auto-title is dead code: every workout is titled "Workout" (#151)**

- Priority: P2
- Screen or flow: Today, workout creation; History list
- Problem: the day-of-week default title and the rename guard in `src/queries/workouts.ts` never run because the only `createWorkout` caller hardcodes `title: 'Workout'` (`src/screens/Today.tsx:145`, verified).
- Recommended improvement: drop the explicit title so the day-of-week default applies, or extend the guard to treat `'Workout'` as a default title; longer term, replace the string-equality heuristic with an explicit `title_is_auto` flag set at creation.
- Expected user impact: History reads "Tuesday", "Push day" instead of an undifferentiated wall of "Workout".
- Implementation notes: none.
- Files likely involved: `src/screens/Today.tsx`, `src/queries/workouts.ts`, `src/lib/dayOfWeek.ts`

**1.7 Title-input fallback shows the current day, not the workout's start day (#156)**

- Priority: P3
- Screen or flow: WorkoutActive title input
- Problem: the fallback renders today's day name even when the workout started yesterday.
- Recommended improvement: use `dayOfWeek(activeQuery.data?.started_at)` for the fallback, or drop the fallback since the title cannot be null.
- Expected user impact: midnight-spanning workouts stop mislabeling themselves.
- Implementation notes: none.
- Files likely involved: `src/screens/WorkoutActive.tsx`

**1.8 Workout "day" attribution is inconsistent across surfaces (#155)**

- Priority: P3
- Screen or flow: History grouping, Today RECENT rows, RepeatCard age
- Problem: History groups by `started_at`, the Repeat card counts age from `ended_at`, and RECENT rows use `started_at`, so the same workout can read as different days on adjacent surfaces.
- Recommended improvement: declare `started_at` the canonical workout day (an 11pm session belongs to the day you walked in), switch the Today reads to it, and align the chart's day bucketing with the same convention.
- Expected user impact: the "when did I train" story is identical everywhere.
- Implementation notes: document the convention alongside the time-semantics note proposed in 5.1.
- Files likely involved: `src/screens/Today.tsx`, `src/screens/History.tsx`, `src/queries/history.ts`

**1.9 Five duplicate date/age formatters with divergent output (#72)**

- Priority: P3
- Screen or flow: Today, SessionRecap, sync sheets
- Problem: relative-age and duration formatting is implemented five times with inconsistent user-visible output, while `src/core/format.ts` carries dead exports.
- Recommended improvement: consolidate into `src/core/format.ts`: one `relativeAge(iso)` shared by both sync sheets, an exported `daysSince`, day names routed through `src/lib/dayOfWeek.ts`, and delete or adopt the dead helpers.
- Expected user impact: the same timestamp formats identically everywhere.
- Implementation notes: none.
- Files likely involved: `src/core/format.ts`, `src/screens/Today.tsx`, `src/ui/SessionRecap.tsx`, `src/components/QuarantineSheet.tsx`, `src/sync/outboxPreview.ts`, `src/components/CollisionSheet.tsx`

**1.10 The hero stepper shows a bare number with no unit (#136)**

- Priority: P3
- Screen or flow: WorkoutActive logging surface
- Problem: the unit label renders only when `focused && size === 'hero'` (`src/components/NumericStepperView.tsx`, verified), so the primary logging surface shows a unitless number most of the time.
- Recommended improvement: always render the weight unit beside the hero value, dimmed to `inkTertiary` when unfocused; keep REPS hidden if visual calm matters by special-casing it.
- Expected user impact: no kg/lb ambiguity at the exact moment of logging, which matters more now that units are stamped per set (#131).
- Implementation notes: none.
- Files likely involved: `src/components/NumericStepperView.tsx`

**1.11 "SESSION VOLUME" copy and Session component names violate the glossary (#70)**

- Priority: P3
- Screen or flow: WorkoutActive live tally, finish recap
- Problem: "SESSION VOLUME" renders to users in `src/ui/SessionRecap.tsx` and `src/components/SessionVolumeBar.tsx` while `docs/overview.md` bans "session" as a synonym for workout; the component names repeat the violation.
- Recommended improvement: change the copy to "WORKOUT VOLUME" and rename the components `WorkoutRecap`/`WorkoutVolumeBar`; fix `docs/overview.md`'s own loose "session" prose so the glossary stops contradicting itself.
- Expected user impact: one product vocabulary; future AI sprints stop inheriting the synonym.
- Implementation notes: the plan-side glossary violations are item 5.3.
- Files likely involved: `src/ui/SessionRecap.tsx`, `src/components/SessionVolumeBar.tsx`, `docs/overview.md`

## 2. Voice logging

**2.1 The voice error phase renders as success (new: journey 10 re-rating)**

- Priority: P2
- Screen or flow: WorkoutActive voice strip and mic button
- Problem: `src/components/ActiveSetCard.tsx` renders the error phase through the applied branch of its `listening ? ... : pending ? ... : '✓ ' + feedback` ternary, so error text gets a check-mark prefix, and `src/screens/WorkoutActive.tsx` maps phase `'error'` to the mic's listening visual, so after a permission denial the button reads "Listening" while nothing records.
- Recommended improvement: give error its own branch (no check prefix, `inkSecondary` or `danger` ink), map `'error'` to the idle or a dedicated error visual on `VoiceMicButton`, and add an "Open Settings" affordance via `Linking.openSettings()` after a mic-permission denial.
- Expected user impact: failed voice stops impersonating success; denial becomes recoverable in-app.
- Implementation notes: none.
- Files likely involved: `src/components/ActiveSetCard.tsx`, `src/screens/WorkoutActive.tsx`, `src/components/VoiceMicButton.tsx`, `src/voice/useVoiceSession.ts`

**2.2 Voice-dispatched values bypass the keypad clamp (#137 remainder)**

- Priority: P3
- Screen or flow: voice set logging
- Problem: `setValues` in `src/voice/dispatch.ts` patches `command.weight`/`command.reps` directly without the `sanitizeNumber` bounds the keypad uses (grep: no clamp in `src/voice/dispatch.ts` or `src/voice/grammar.ts`), so a misheard "bench 9999" writes an unbounded value.
- Recommended improvement: run parsed numbers through `sanitizeNumber` (`src/components/numericStepper.ts`) before patching, and downgrade out-of-range values to the pending-confirm path.
- Expected user impact: a misheard number cannot become an absurd row; until 1.1 ships, prevention is the only protection.
- Implementation notes: the keypad half of #137 was closed by #19; the server-side CHECK constraint half is a repo-review item.
- Files likely involved: `src/voice/dispatch.ts`, `src/components/numericStepper.ts`

**2.3 Recognition locale hardcoded to en-US (#106)**

- Priority: P3
- Screen or flow: voice availability and recognition
- Problem: the engine recognizes en-US only, and `isAvailable()` does not verify the on-device support that `start()` actually requires, so the mic's enabled state can lie.
- Recommended improvement: resolve the recognition lang from the device locale for English variants (expo-localization, falling back to en-US) and use the library's on-device/locale-support query inside `isAvailable()`; keep the grammar en-only as deliberate scoping.
- Expected user impact: en-GB/en-IN/en-AU users get accurate recognition; the disabled state becomes truthful.
- Implementation notes: none.
- Files likely involved: `src/voice/speechEngine.ts`

**2.4 Engine confidence and parser context are plumbed but ignored (#107)**

- Priority: P3
- Screen or flow: voice command routing
- Problem: confidence and `hasActiveExercise` flow through the types but nothing reads them, masking the one signal that could gate destructive commands.
- Recommended improvement: when engine confidence is present and below ~0.4, downgrade any parsed command to the pending-confirm path; use `hasActiveExercise` to pend data commands; otherwise strip both fields so the next reader is not misled.
- Expected user impact: fewer wrong sets logged from noisy gym audio.
- Implementation notes: none.
- Files likely involved: `src/voice/speechEngine.ts`, `src/voice/grammar.ts`, `src/voice/commands.ts`

## 3. Rest timer

**3.1 No visible countdown: the most-stared-at element is a 2px line (#24; journey 7)**

- Priority: P2
- Screen or flow: WorkoutActive rest timer
- Problem: the only in-app rest surface is `src/components/RestProgressBar.tsx`, a 2px hairline with a 12px hit area, no numeric countdown, and no manual start or skip outside voice.
- Recommended improvement: when `timer.running`, expand the strip into a slim rest bar: a large Geist Mono countdown ("1:23 / 2:00"), the hairline beneath, a 44pt skip target on the right edge, and a small label hinting the long-press override; cross from `inkSecondary` to `accent` at target with the existing success haptic.
- Expected user impact: the single most daily-felt craft moment in a gym product; also gives non-voice users start/skip control.
- Implementation notes: needs simulator/visual QA (this is why it was deferred from Phase 4); reuse `effectiveRest` from `src/ui/restOverrides.ts` for the target display.
- Files likely involved: `src/components/RestProgressBar.tsx`, `src/ui/hooks/useRestTimer.ts`, `src/screens/WorkoutActive.tsx`

**3.2 Notification category referenced but never registered (#164)**

- Priority: P3
- Screen or flow: rest-done notification on the lock screen
- Problem: `scheduleRestDone` sets `categoryIdentifier: REST_CATEGORY` (`src/lib/restNotifications.ts:77`) but no `setNotificationCategoryAsync` call exists (grep verified), so the field is dead config and the lock-screen action slot goes unused.
- Recommended improvement: register the category at startup with "Skip rest" and "+30s" actions handled by the notification-response listener, or delete the constant and the field.
- Expected user impact: one-handed rest control from the lock screen, where most rest actually happens.
- Implementation notes: needs device QA; iOS action buttons do not appear in the simulator reliably.
- Files likely involved: `src/lib/restNotifications.ts`, `app/_layout.tsx`

## 4. Progress and personal records

**4.1 Progress chart is the weakest screen in a product about progress (#29; journey 13)**

- Priority: P2
- Screen or flow: Progress chart
- Problem: one heaviest-weight-per-day chart with system-font ticks, arbitrary tick values, no PR markers, no interaction, no range or metric controls, and exercise selection only through the PR list in `src/screens/Progress.tsx`, so an exercise without a PR cannot be charted.
- Recommended improvement: GeistMono tick labels; a nice-number tick algorithm (multiples of 2.5/5/25 in the user's unit, unit on the top tick); accent ring plus "PR" micro-label on record points; a header numeral with current best and delta vs 90 days; tap-and-hold scrub with a mono readout; an 8/12-week segmented range; and an exercise picker entry that is not gated on having a PR.
- Expected user impact: the screen that justifies a strength journal stops reading as a placeholder.
- Implementation notes: needs simulator/visual QA; `getHeaviestWeightHistory` (`src/queries/personalRecords.ts`) already handles local-day bucketing and mixed units (#149 fixed).
- Files likely involved: `src/ui/LineChart.tsx`, `src/screens/Progress.tsx`, `src/queries/personalRecords.ts`

**4.2 PR backfill re-runs every app session (#52)**

- Priority: P3
- Screen or flow: Progress mount
- Problem: the one-time `recomputeAllPRs` backfill is guarded by the in-memory `prBackfilledFor` in `src/screens/Progress.tsx`, so every app session pays a full scan of completed sets on first Progress open.
- Recommended improvement: persist the marker durably in the existing KV store (key like `pr-backfill-done:<userId>`), keep the in-memory guard as a fast path, and bump the key when PR-detection logic changes.
- Expected user impact: first Progress open per session stops stuttering on large histories.
- Implementation notes: none.
- Files likely involved: `src/screens/Progress.tsx`, `src/queries/personalRecords.ts`

**4.3 PR-recording failures are swallowed silently (#146)**

- Priority: P3
- Screen or flow: finish workout, PR detection
- Problem: `finishWorkout`'s bare catch around PR recording (`src/queries/workouts.ts`) means a regression in the seam produces silently missing PRs.
- Recommended improvement: replace the bare catch with `captureException(err, { seam: 'pr-detection' })` using the existing `src/lib/errorReporting.ts`, preserving the best-effort contract.
- Expected user impact: missing-PR regressions become visible instead of permanent.
- Implementation notes: none.
- Files likely involved: `src/queries/workouts.ts`, `src/lib/errorReporting.ts`

## 5. Training plans

**5.1 The plan never reaches Today: Plans are decorative (#109, #153; journey 15)**

- Priority: P1
- Screen or flow: Today, TrainingPlan, plan-to-workout loop
- Problem: no screen calls `createWorkout` with a `templateId` (grep: the identifier appears only in `src/core/domain.ts`, `src/queries/plans.ts`, `src/queries/workouts.ts`, `src/screens/PlanSetup.tsx`), `day_of_week` slots are stored and rendered but never resolved, and Today's "Templates" button (`src/screens/Today.tsx:274`) just links to `/profile/plan`.
- Recommended improvement: on Today, query the active plan, resolve today's slot (weekly via local `getDay()` matching `src/lib/dayOfWeek.ts`; cycle via a cursor advanced in `finishWorkout`), and render a "Scheduled: Push day, Start" card that creates a workout seeded from the template's exercises through `templateId`; until that ships, rename the "Templates" button to "Plan" so it stops promising template-starting it cannot do; write the day-boundary convention (UTC instants stored, device-local calendar days for all day semantics) into ARCHITECTURE.md.
- Expected user impact: converts an entire built-and-tested feature from decorative to the product's spine; the single largest open capability gap.
- Implementation notes: feature-sized (multi-day); write a spec first; the rename-the-button mitigation is a 1-line same-day fix.
- Files likely involved: `src/screens/Today.tsx`, `src/queries/plans.ts`, `src/queries/workouts.ts`, `src/screens/TrainingPlan.tsx`, `src/db/schema.ts`, `ARCHITECTURE.md`

**5.2 Plan save fails silently (#69)**

- Priority: P2
- Screen or flow: PlanSetup save
- Problem: the `src/queries/plans.ts` mutation hooks drop the codebase's onError-to-toast idiom, so a failed save in `src/screens/PlanSetup.tsx` shows nothing and the user's edits evaporate.
- Recommended improvement: add the standard `onError?: (msg: string) => void` parameter to both plan hooks with "Failed to save plan" fallbacks, pass a toast callback from PlanSetup, and gate navigation on success.
- Expected user impact: no silent loss of plan edits.
- Implementation notes: none.
- Files likely involved: `src/queries/plans.ts`, `src/screens/PlanSetup.tsx`

**5.3 Plan-screen copy violates the glossary and reads placeholder (#70 remainder)**

- Priority: P3
- Screen or flow: PlanSetup preset list
- Problem: the "Programs" group title (`src/screens/PlanSetup.tsx:371`) violates the glossary's ban on "program", the sibling "Generic" title (`:368`) reads like a placeholder, and seed blurbs rendered at `:394` say "sessions" for workouts (`supabase/migrations/00008_seed_plan_presets.sql`).
- Recommended improvement: retitle the groups (for example "Named plans" and "Starting points"), rewrite the blurbs to use "workouts", and document the DB `tier` value `'program'` as a sanctioned internal exception in `docs/overview.md` rather than renaming a CHECK-constrained seeded column.
- Expected user impact: the highest-copy-density screen speaks the product vocabulary.
- Implementation notes: blurb fix is a seed/migration change, not just TSX.
- Files likely involved: `src/screens/PlanSetup.tsx`, `supabase/migrations/00008_seed_plan_presets.sql`, `docs/overview.md`

## 6. Profile and settings

**6.1 Rest-alert denial has no surfaced state or recovery (#158 remainder)**

- Priority: P2
- Screen or flow: Profile; rest notifications
- Problem: the capability half of #158 shipped (`getRestAlertStatus` exists in `src/lib/restNotifications.ts:33`) but it has no consumer: `src/screens/Profile.tsx` has no "Rest alerts" row (grep verified), so after a denial `scheduleRestDone` silently returns null forever.
- Recommended improvement: add a Profile row showing "Rest alerts: off" when denied, with a button calling `Linking.openSettings()`, and re-derive the status via `getPermissionsAsync` on AppState `active` so a Settings grant is picked up the same session.
- Expected user impact: a one-time denial stops permanently and invisibly disabling the timer's background half.
- Implementation notes: needs device QA for the Settings round-trip.
- Files likely involved: `src/screens/Profile.tsx`, `src/lib/restNotifications.ts`

## 7. Appearance and skin system

**7.1 Text-primitive migration is incomplete (#22 remainder, #65)**

- Priority: P2
- Screen or flow: all screens
- Problem: the Geist sweep (commit 2521a49) was partial by design: the swept screens still use raw React Native `Text` in places instead of the variant-based primitive in `src/ui/Text.tsx`, leaving system-font and `fontWeight` regressions one edit away.
- Recommended improvement: finish migrating every screen to the primitive's variants (`src/ui/textVariants.ts`), then add an ESLint `no-restricted-syntax` guard forbidding `fontWeight` in style objects and raw `react-native` Text imports outside `src/ui`.
- Expected user impact: one typographic voice across all nine screens, enforced rather than maintained by vigilance.
- Implementation notes: needs simulator visual QA per screen; mechanical otherwise.
- Files likely involved: `src/ui/Text.tsx`, `src/ui/textVariants.ts`, `src/screens/*.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`

**7.2 Two parallel styling architectures (#66, absorbing #32)**

- Priority: P2
- Screen or flow: Today, WorkoutActive, History, HistoryDetail
- Problem: `makeStyles(theme)` factories coexist with static `StyleSheet` plus inline theme arrays, and the hero screens mix 16/20pt gutters and off-scale radii in the same column.
- Recommended improvement: bless the `makeStyles(theme)` factory, migrate Today and WorkoutActive first, convert raw spacing literals to `theme.space` tokens and stray radii onto the radius scale, and document the pattern with a real `useTheme` example in `docs/design-system.md`.
- Expected user impact: flagship screens feel machined instead of assembled; future skin work touches one style source.
- Implementation notes: needs simulator QA (deferred visual cluster); fold the #32 gutter pass into the same migration commits.
- Files likely involved: `src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`, `src/screens/History.tsx`, `src/screens/HistoryDetail.tsx`, `src/components/ActiveSetCard.tsx`, `src/components/SessionVolumeBar.tsx`, `src/components/QuarantineBanner.tsx`, `docs/design-system.md`

**7.3 No Sheet primitive: five divergent modal implementations (#26, #71)**

- Priority: P2
- Screen or flow: all sheets and modals
- Problem: five divergent sheet/modal implementations, four of which duplicate ~70 lines of scaffolding each with copy-paste defects; one has a dead exit animation, and the core flow still uses an OS Alert.
- Recommended improvement: build one `<Sheet>` primitive (backdrop fade, panel spring-in, deferred unmount so the exit animation plays, handle, themed surface and radius, reduce-motion fallback) plus a `<ConfirmSheet>`; port all five callers, with CollisionSheet as a `centered` variant.
- Expected user impact: dismissals stop feeling default-RN; unblocks 1.2, 1.4, and 8.4 to share one confirm pattern.
- Implementation notes: needs simulator QA; do this before the items that want ConfirmSheet.
- Files likely involved: `src/components/ExercisePicker.tsx`, `src/components/RestOverrideSheet.tsx`, `src/components/QuarantineSheet.tsx`, `src/components/CollisionSheet.tsx`, `src/components/SyncDiagnosticsSheet.tsx`, `src/screens/WorkoutActive.tsx`

**7.4 Launch and icon assets ignore the light/dark system (#130)**

- Priority: P2
- Screen or flow: app launch, home screen
- Problem: light-mode users get a dark-only splash, there are no iOS 18 dark/tinted icon variants, and the notification icon is a placeholder.
- Recommended improvement: use the object forms (`ios.icon { light, dark, tinted }`, an expo-splash-screen `dark` block with a light splash for light mode), generate variants from the icon source, and move the notification-icon TODO into the `docs/operations.md` release checklist.
- Expected user impact: first impression matches the user's system appearance.
- Implementation notes: needs an EAS build plus device verification; pure config otherwise.
- Files likely involved: `app.config.ts`, `assets/`, `docs/operations.md`

**7.5 Icon language is incoherent; TabIcon ignores `focused` (#30)**

- Priority: P3
- Screen or flow: tab bar, mic button, steppers
- Problem: the mic button renders a color emoji (`src/components/VoiceMicButton.tsx:46`) against an otherwise SVG-and-typography system, ad-hoc text glyphs stand in for icons, and `TabIcon` declares a `focused` prop it never reads (`src/ui/TabIcon.tsx`, verified).
- Recommended improvement: extend TabIcon into a small SVG icon registry (mic, check, chevrons, arrow-right) at 1.8 stroke; use `focused` to bump stroke to ~2.2 or fill; replace the emoji; keep the deliberate text-arrow idiom ("history →"), which reads as intentional typography.
- Expected user impact: one icon voice; the active tab reads as active.
- Implementation notes: needs simulator QA (deferred visual cluster).
- Files likely involved: `src/ui/TabIcon.tsx`, `src/components/VoiceMicButton.tsx`, `src/components/NumericStepperView.tsx`, `src/components/ActiveSetCard.tsx`, `src/screens/Profile.tsx`

**7.6 Brand mark underdelivers: per-skin metal finishes are dead capability (#33; skin verification)**

- Status: CLOSED-OBSOLETE (2026-08-09). `src/ui/Medal.tsx` and the medallion brand were deleted in the Forged Iron rebrand (2026-06-12); the mark is now the loaded-bar `src/ui/BrandMark.tsx` and Login already uses it via `<FBarMark>`. Nothing here applies to the current identity.

**7.7 Boot overlay pinned to Forge dark; theme shim still alive (new: skin verification)**

- Priority: P3
- Screen or flow: app boot, boot-error screen
- Problem: `BootOverlay` and its "Cannot start" error screen render Forge dark on every skin and scheme because they are the last consumers of the static shim `src/ui/theme.ts`, whose header still promises deletion; the shim also carries dead brand color constants and a stale comment claiming `Logo.tsx` consumes its re-exports (it does not, verified).
- Recommended improvement: render BootOverlay from `darkPalette`/`lightPalette` (`src/ui/colors.ts`) keyed on the system scheme (skin hydration is what boot waits on, so scheme is the most that can adapt), move the `brand` name/tagline strings to a small module, and delete the shim.
- Expected user impact: light-mode users stop getting a dark flash of another skin's chrome at every launch.
- Implementation notes: none.
- Files likely involved: `app/_layout.tsx`, `src/ui/theme.ts`, `src/ui/colors.ts`, `src/ui/Logo.tsx`, `src/screens/Login.tsx`

**7.8 Contrast suite misses the riskiest on-screen pairs (new: skin verification)**

- Priority: P3
- Screen or flow: all skins, both schemes
- Problem: the 64-test contrast suite covers eight ink-on-surface pairs per palette but nothing covers `onAccent` on `accent` (every primary button), `onAccent` on `danger` (Toast error text, reused on the assumption in `src/ui/ToastContext.tsx` that it "reads on the danger fill in both schemes"), `danger`/`accent` on `bg`/`surface`, or anything on `surface2`.
- Recommended improvement: extend `src/ui/__tests__/contrast.test.ts` with those pairs (4.5 body, 3.0 large) across all eight palette variants and adjust any failing skin seed in `src/ui/skins.ts`.
- Expected user impact: every button and error toast is guaranteed legible on all four skins in both schemes.
- Implementation notes: none.
- Files likely involved: `src/ui/__tests__/contrast.test.ts`, `src/ui/skins.ts`, `src/ui/colors.ts`, `src/ui/ToastContext.tsx`

## 8. Empty, loading, error, and offline states

**8.1 Failed magic-link exchange is silently swallowed; sent state is a dead end (#94; journey 2)**

- Priority: P1
- Screen or flow: Login, magic-link deep link
- Problem: an expired or failed code exchange disappears into `catch {}` in `handleUrl` (`app/_layout.tsx`), whose comment claims "we surface auth errors via the AuthProvider state" while `src/auth/AuthContext.tsx` has no error field (both verified), and the non-error `exchangeCodeForSession` failure result is also ignored; Login's "Check your email" sent state (`src/screens/Login.tsx:79`) has no back or resend affordance.
- Recommended improvement: surface the failure (route to `/login?linkError=1` or add an error field to AuthContext that Login renders as "That link expired. Send a new one."), handle the returned `error` as well as the throw, fix the false comment, and add resend and back actions to the sent state.
- Expected user impact: the single most fragile moment of the funnel (a stale email link) stops stranding users silently at the front door.
- Implementation notes: none.
- Files likely involved: `app/_layout.tsx`, `src/auth/AuthContext.tsx`, `src/screens/Login.tsx`, `src/auth/authActions.ts`

**8.2 First run drops the user cold (#119; journey 1)**

- Priority: P2
- Screen or flow: Login, empty Today
- Problem: there is no onboarding, empty Today's most prominent element is non-interactive copy (inverting one-dominant-action-per-screen), and the root gate requires sign-in before any local use despite the local-first architecture.
- Recommended improvement: make the empty-state card itself the start action ("Start your first workout →" calling `onBlankStart`, styled like ResumeCard), and make magic link the primary button on Login with password as the secondary path; an anonymous local-only mode is a real product decision that deserves its own spec rather than a backlog line.
- Expected user impact: time-to-first-set for a brand-new user drops to two taps after sign-in.
- Implementation notes: none.
- Files likely involved: `src/screens/Today.tsx`, `src/screens/Login.tsx`, `app/_layout.tsx`

**8.3 Today's sync error stripe is unexplained and unactionable (#114 remainder)**

- Priority: P2
- Screen or flow: Today sync surfaces
- Problem: the 1px red stripe is `pointerEvents="none"` (`src/components/SyncErrorStripe.tsx`, verified) and Today renders no `SyncIndicator` (it lives on Progress, History, WorkoutActive, and Profile, where tapping it opens `SyncDiagnosticsSheet`), so there is no path from the stripe to diagnostics; the pulse loop also outlives its 30s window because the timeout only calls `opacity.setValue(0)` while the loop keeps animating until sync state changes. The skin-token part of #114 is fixed: `SyncIndicator` is fully themed.
- Recommended improvement: put the SyncIndicator pill on Today's top row (or make the stripe tappable to open the diagnostics sheet), and stop `loopRef.current` inside the window-expiry timeout.
- Expected user impact: the scariest pixel in the app becomes explainable and actionable.
- Implementation notes: none.
- Files likely involved: `src/components/SyncErrorStripe.tsx`, `src/screens/Today.tsx`, `src/ui/SyncIndicator.tsx`

**8.4 "Discard all" abandons unsynced changes with one unconfirmed tap (#115)**

- Priority: P2
- Screen or flow: QuarantineSheet
- Problem: `handleDiscardAll` in `src/components/QuarantineSheet.tsx` runs immediately on tap (no confirm, verified), sitting directly adjacent to "Retry all".
- Recommended improvement: wrap both discard paths in a destructive-styled confirmation ("Discard N unsynced changes?"), matching the existing skip-set confirm pattern, or ConfirmSheet once 7.3 lands.
- Expected user impact: a guard rail on the app's most destructive surviving tap.
- Implementation notes: none.
- Files likely involved: `src/components/QuarantineSheet.tsx`

**8.5 Raw internal error text reaches user-facing toasts (new: copy sweep)**

- Priority: P2
- Screen or flow: Today toasts
- Problem: workout mutation hooks pass raw `err.message` straight to the toast callback (`src/queries/workouts.ts`, `src/queries/repeatLastWorkout.ts`, verified in the sweep), so SQLite or internal error text can surface via `showToast(msg, 'error')` on Today; the curated fallbacks only fire for non-Error throws.
- Recommended improvement: invert the pattern: always toast curated copy ("Couldn't start workout") and route the raw error to `captureException` in `src/lib/errorReporting.ts`.
- Expected user impact: users never read engine internals in a toast.
- Implementation notes: none.
- Files likely involved: `src/queries/workouts.ts`, `src/queries/repeatLastWorkout.ts`, `src/screens/Today.tsx`, `src/lib/errorReporting.ts`

**8.6 Error-toast wiring drifts across screens (#75)**

- Priority: P3
- Screen or flow: Today, Profile, WorkoutActive
- Problem: the sync-aware error filter is applied on one screen while the other two pass raw toast lambdas, so the same failure class behaves differently per screen.
- Recommended improvement: export a single `useErrorToast` from `src/ui/ToastContext.tsx` (sync-aware by default) and use it in all three screens, deleting the per-screen lambdas; where a raw variant is genuinely wanted, say so in a comment.
- Expected user impact: consistent error behavior everywhere.
- Implementation notes: none.
- Files likely involved: `src/ui/ToastContext.tsx`, `src/screens/Today.tsx`, `src/screens/Profile.tsx`, `src/screens/WorkoutActive.tsx`

**8.7 Copy pass: punctuation, terse labels, and empty-state inconsistency (new: copy sweep)**

- Priority: P3
- Screen or flow: all screens
- Problem: user-facing strings contain em dashes and curly quotes (the Login password placeholder, the Forge skin blurb rendered in the skin picker, the voice confirm strip in `src/components/ActiveSetCard.tsx:246`, and the config error in `src/auth/supabase.ts` that the boot screen renders verbatim); labels drift terse ("+ Blank" on Today vs its own a11y label "Start a blank workout", generic "Confirm" on the voice button, bare "Save" in RestOverrideSheet); visible "Back to Today" disagrees with its a11y label "Back to today"; and empty states split ~50/50 on terminal periods.
- Recommended improvement: one sweep: replace prose em dashes with commas or colons and curly quotes with straight quotes (keep the standalone missing-value glyph convention in `src/core/format.ts`, which is deliberate); rename "+ Blank" to match its a11y label's intent; "Confirm" to "Log it"; standardize empty states on terminal periods; align a11y labels with visible text.
- Expected user impact: copy reads like one author wrote it.
- Implementation notes: none.
- Files likely involved: `src/screens/Login.tsx`, `src/ui/skins.ts`, `src/components/ActiveSetCard.tsx`, `src/auth/supabase.ts`, `src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`, `src/components/RestOverrideSheet.tsx`, `src/screens/Progress.tsx`, `src/screens/TrainingPlan.tsx`, `src/ui/LineChart.tsx`

## 9. Accessibility

**9.1 WorkoutActive is effectively unusable with VoiceOver (#108)**

- Priority: P1
- Screen or flow: WorkoutActive
- Problem: set completion is swipe-only with no button alternative (`COMPLETION_THRESHOLD` pan in `src/components/ActiveSetCard.tsx`; voice "done" is the only other path), and the weight/reps steppers are flattened behind a parent focus-clearing Pressable so they never surface as individual elements.
- Recommended improvement: add `accessibilityActions={[{ name: 'activate', label: 'Complete set' }]}` with `onAccessibilityAction` calling the existing complete handler (or a visually subordinate "Complete set" button); replace the focus-clearing Pressable with a View using `onStartShouldSetResponder` or `accessible={false}` so steppers surface; announce completions and toasts via `AccessibilityInfo.announceForAccessibility`.
- Expected user impact: the core loop becomes usable with a screen reader at all.
- Implementation notes: needs device QA with VoiceOver; simulator screen-reader behavior is not representative.
- Files likely involved: `src/components/ActiveSetCard.tsx`, `src/screens/WorkoutActive.tsx`, `src/ui/ToastContext.tsx`

**9.2 Dynamic Type will clip text app-wide (#117)**

- Priority: P2
- Screen or flow: all screens
- Problem: fixed-height controls everywhere and no `maxFontSizeMultiplier` strategy mean large accessibility text sizes clip rather than reflow.
- Recommended improvement: replace fixed `height` with `minHeight` plus vertical padding on the listed controls, and set a deliberate `maxFontSizeMultiplier` (1.4-2.0) on dense chrome like the 10pt tracked micro-labels and hero steppers where layout genuinely cannot flex.
- Expected user impact: the app survives the accessibility text-size slider instead of breaking at the first notch.
- Implementation notes: needs device QA across text sizes.
- Files likely involved: `src/screens/Login.tsx`, `src/components/VoiceMicButton.tsx`, `src/components/ExercisePicker.tsx`, `src/screens/Profile.tsx`

**9.3 Touch targets below the 44pt floor in daily flows (#27)**

- Priority: P2
- Screen or flow: rest bar, Today alt buttons, PlanSetup pills, header actions, stepper chevrons
- Problem: multiple daily-use targets fall well below 44pt, including the 12px rest-bar hit area and the header next/finish.
- Recommended improvement: a `minHeight: theme.touch.min` audit pass: a 44pt pressable strip for `RestProgressBar`, 44pt Today alt buttons and PlanSetup pills, the header next/finish as a proper 44pt pill (or moved per 1.5), and stepper chevrons spaced so hit slops do not overlap.
- Expected user impact: fewer missed taps with chalked, shaking hands, which is the actual usage context.
- Implementation notes: needs simulator QA with the layout inspector; land together with 1.5 and 3.1 to avoid touching the same components twice.
- Files likely involved: `src/components/RestProgressBar.tsx`, `src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`, `src/screens/PlanSetup.tsx`, `src/components/NumericStepperView.tsx`

## 10. Microinteractions and haptics

**10.1 The live PR moment never fires (#25 remainder)**

- Priority: P2
- Screen or flow: set completion choreography, finish recap
- Problem: `SessionVolumeBar` calls `pulse()` with no `isPR` argument, so the PR-strength glow (0.45 peak), the success haptic, and the `showPRPill` output of `computeChoreography` are never exercised live, and the recap's built "NEW PERSONAL RECORD(S)" card never renders because the sole `SessionRecap` call site omits the `prs` prop (its own doc comment says so); PR detection currently happens only at finish (`recordWorkoutPRs` in `src/queries/workouts.ts`). The glow-visibility half of #25 is fixed (commit dd75760).
- Recommended improvement: compare the banked set against `personal_records` at completion (the queries exist in `src/queries/personalRecords.ts`), thread `isPR` through `onComplete` into `pulse(isPR)`, render the PR pill, and pass `prs` into `SessionRecap`; add a test pinning the glow fill to `theme.color.accent` so all four skins keep their own accent (the choreography layer is deliberately colorless and currently unpinned).
- Expected user impact: the product's biggest designed emotional payoff actually happens, at the moment it is earned instead of never.
- Implementation notes: the choreography planner is already unit-tested; needs simulator QA for feel and reduced-motion behavior.
- Files likely involved: `src/components/SessionVolumeBar.tsx`, `src/screens/WorkoutActive.tsx`, `src/ui/completeSetChoreography.ts`, `src/ui/useCompleteSetAnimation.ts`, `src/ui/SessionRecap.tsx`, `src/queries/personalRecords.ts`

---

Cross-cutting note: 1.2, 1.4, 8.4, and 1.1 all want a shared confirm/sheet pattern; sequencing 7.3 (Sheet primitive) first avoids building the same interaction four ways. The device-QA items (3.2, 6.1, 7.4, 9.1, 9.2) batch naturally into one device-testing session.
