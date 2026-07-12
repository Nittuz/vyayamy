# FlexYug Repository Review

**Date:** 2026-06-10
**Tree reviewed:** `main` @ `c8412ae`
**Method:** 16-dimension multi-agent deep review (2026-06-09/10), every medium+ finding adversarially verified, followed by five merged fix phases and a fresh re-verification of the current tree.
**Companion documents:** [docs/specs/2026-06-10-deep-review-improvement-plan.md](../specs/2026-06-10-deep-review-improvement-plan.md) (narrative synthesis, phase plan, full findings appendix), [docs/ARCHITECTURE_REALITY.md](ARCHITECTURE_REALITY.md) (architecture-as-built, in depth).

---

## 1. Executive summary

A 16-dimension deep review of FlexYug produced 165 raw findings, 115 confirmed after adversarial verification (4 critical, 35 high). Roughly 33 fix commits across Phases 0 through 4 have since merged to `main`, closing all 4 criticals and 24 of the 35 highs, including the silent-data-loss outbox ordering hole (#0), the unit-less weight semantics (#131), the offline freeze of the active workout screen (#11), and the missing CI gate (#126). Current `main` is verified green: 439/439 tests, `tsc` clean, ESLint 0 errors, CI enforcing all three on every push and PR (`.github/workflows/ci.yml`). What remains open at high severity is concentrated in five areas: schema-skew pull fragility (#56), decorative local migrations (#57), testing gaps around the real cursor, pull predicate, and sign-out teardown (#77, #79, #80), the inescapable CollisionSheet (#111), and the plaintext session JWT (#88, blocked on a device-tested `expo-secure-store` change). The product core (logging a set, repeating a workout, operating offline, skins, voice) is genuinely strong; the weakest user-facing seams are the absence of any set-correction path after completion, the rest timer's missing countdown, and the decorative training plan.

## 2. Architecture reality

What the docs promise and what the tree contains now match closely, after the Phase 4 reconciliation (`d497691`, #73; `50e40d8`, #38; `68d9f1c`, #35). The deep treatment lives in [docs/ARCHITECTURE_REALITY.md](ARCHITECTURE_REALITY.md); the short version:

**Real and verified on main:**

- **Local-first spine.** `expo-sqlite` is the source of truth; every read is local (`src/queries/*`); every write commits the row and an outbox entry in one transaction (`addSet` in `src/queries/sets.ts`). TanStack Query fronts SQLite, not the network.
- **Sync engine.** In-house outbox (`src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/engine.ts`) with per-row FIFO ordering and row-count verification (#0, `548804a`), per-table and per-row pull fault isolation (#2, `e35a831`), transient 5xx/429 classification (`src/sync/push.ts`, #3), and a structural mutation event bus replacing the 12-call-site `triggerPush` convention (#34, `caca145`). Sync no longer imports the UI layer (#36, `4c671ec`).
- **Units.** Per-set unit stamping with canonical conversion at the read boundary (#131, #133, #134, #135, #68; `f76981f` + `0295643`). `src/core/units.ts` exists and is consumed.
- **PRs demoted to a local derived cache.** `personal_records` is no longer a synced table; recompute is authoritative in both directions (#138 through #145, `c0254f3`; `recomputeAllPRs` in `src/queries/personalRecords.ts`).
- **Auth.** Single root-level gate covering all routes (`AppNavigator` effect in `app/_layout.tsx`, #91, `d61f04a`), PKCE magic link plus password fallback (`src/auth/supabase.ts`, `src/screens/Login.tsx`).
- **Skin system.** Four skins, 17 token roles, zero hex/rgb leaks outside the sanctioned palette and brand files (`src/ui/colors.ts`, `src/ui/skins.ts`, `src/ui/Medal.tsx`), 64 WCAG contrast tests across all eight palette variants (`src/ui/__tests__/contrast.test.ts`).

**Intended but not (fully) real:**

- **Training plans are decorative.** `src/screens/PlanSetup.tsx` and `src/screens/TrainingPlan.tsx` work, but no screen ever starts a workout from a template; `templateId` has no UI caller (#109, #153, deferred feature work).
- **The legacy theme shim survives.** `src/ui/theme.ts` was scheduled for deletion; its last consumer of theme styling is the boot overlay in `app/_layout.tsx` (by design, Forge-dark while skins hydrate). `src/ui/Logo.tsx` and `src/screens/Login.tsx` still import the `brand` identity strings (name, tagline) from the same module; the `brand` color hexes in it are dead constants.
- **Medal skin-adaptive finishes are unwired.** `src/ui/Medal.tsx` ships five metal finishes; every caller renders the default rose (`FBarMark` in `src/ui/Logo.tsx`).
- **The state machine drifted out of its tested module.** `advanceCursor` in `src/components/activeSet.ts` is dead code; the real cursor logic lives in `src/screens/WorkoutActive.tsx` callbacks, untested (#21, #77).

### Skin system verification (all four skins, current main)

| Dimension | Forge | Iron | Ember | Chalk |
|---|---|---|---|---|
| Palette source | `src/ui/colors.ts` (`darkPalette`/`lightPalette`) | `src/ui/skins.ts` (`make(seed)`) | `src/ui/skins.ts` | `src/ui/skins.ts` |
| Full 17-role token shape | Tested | Tested | Tested | Tested (`src/ui/__tests__/skins.test.ts`) |
| WCAG contrast pairs | 16 | 16 | 16 | 16 (64 total, `src/ui/__tests__/contrast.test.ts`) |
| Completion glow adapts | Yes | Yes | Yes | Yes (alpha-only choreography; color is `theme.color.accent` at `src/components/SessionVolumeBar.tsx`) |
| Toast / SyncIndicator / ErrorBoundary adapt | Yes | Yes | Yes | Yes (post `f65ba75`) |
| Medal finish | Fixed rose (gunmetal exists, unwired) | Fixed rose (titanium unwired) | Fixed rose (bronze unwired) | Fixed rose |
| Boot overlay | Forge-dark always, by design (`app/_layout.tsx` `BootOverlay`) | Same | Same | Same |

Resolution is `useTheme()` = system scheme (null coerced to dark) + persisted skin, through a per-`skin:scheme` cache for referential stability (#48 fix, `src/ui/useTheme.ts`). Fallback is structural: `coerceSkin` maps any unknown persisted id to `forge` (`src/ui/skins.ts`), so switching cannot produce out-of-palette colors. A hex/rgb sweep of `src/` and `app/` found zero color literals outside the sanctioned palette files, the fixed-brand medal artwork (`src/ui/Medal.tsx`), and the dead `brand` constants in the legacy shim (`src/ui/theme.ts:101-105`). Known gaps: the contrast suite covers no `onAccent`/`accent`, `onAccent`/`danger`, or `surface2` pairs, and nothing pins the glow fill to the accent token.

## 3. Code quality findings

### Per-dimension reviewer verdicts (review-time, with post-fix delta)

| Dimension | Verdict at review time (2026-06-09) | Where it stands now |
|---|---|---|
| Sync correctness | Well-above-average homegrown engine; craftsmanlike happy path, failure paths a full grade weaker (FIFO/0-row data-loss hole, no pull fault isolation) | All four failure-path criticals/highs fixed (#0, #2, #3, #1); residue is #42/#43 plus low hygiene |
| Workout state | Good bones (pure-logic extraction, single-transaction mutations) but the live loop failed its own constitution offline | Core loop fixed (#11 through #20); cursor logic still untested (#77) |
| UI craft | Top-decile bones (tokens, four skins, WCAG tests, bespoke gesture); split-brain execution, system font on 7 of 9 screens | Chrome themed (#23), font sweep partial (#22/#65); countdown, sheets, icons deferred to visual QA |
| Architecture | Strong local-first spine; every boundary enforced by prose, and the prose had drifted | Boundaries now lint-enforced (#35), docs reconciled (#38, #73); decomposition items open (#39, #40, #41) |
| Performance | Good bones (virtualized lists, parallel boot, worklet gesture); one wrong turn (network-gated freshness) with huge blast radius | Wrong turn reversed (#11/#46, #47, #48, #51); remaining items medium/low |
| Data schema | Above-average where it is hard (tombstones, RLS hardening, CSPRNG UUIDs); meaning of the data undecided | Units and PR semantics fixed; schema-skew (#56) and decorative migrations (#57) still open |
| Consistency drift | Strong hygiene baseline; one clean fault line between two sprints' styling architectures | Fault line partially closed (#22 sweep); #65/#66 remainder deferred |
| Testing quality | Real-SQLite suite with behavioral assertions; seam-blind exactly where the codebase historically bled; lint red | Lint green (#82), CI added (#126), 439 tests; the named seams (#77, #79, #80, #81) still untested |
| Security/privacy | Notably above average (textbook RLS pass, honest threat model); a few sharp edges | Redirect, scrubbing, rate-limit, gate fixed (#89, #90, #93, #91); JWT storage (#88) blocked on device work |

Statuses below come from the verified fix map. "Fixed" means merged to `main` and re-verified on `c8412ae`.

### Sync correctness

| Finding | Status |
|---|---|
| #0 (critical) Outbox replayed out of per-row order and never verified row counts; silent permanent loss (`src/sync/push.ts`) | Fixed `548804a` |
| #2 Pull had zero fault isolation; one bad row wedged the cursor and aborted later tables (`src/sync/pull.ts`) | Fixed `e35a831` |
| #3 5xx/429 classified as permanent; brief outage quarantined valid sets (`src/sync/push.ts`) | Fixed `be3842a` |
| #1 Sign-out wipe raced in-flight sync (`src/sync/engine.ts`) | Fixed `efb547e` |
| #5 Push drained 50 rows max, never looped, backed-off rows never woken (`src/sync/push.ts`) | Fixed `f77fad2` |
| #6 Quarantine discard was non-cascading (`src/sync/quarantine.ts`) | Fixed `76cb905` |
| #8 Pull cursor could skip rows committed out of timestamp order (`src/sync/pull.ts`) | Fixed `3fe61d6` |
| #4 Conflict-resolution snapshot was read outside the page transaction (`src/sync/pull.ts`) | Fixed `3fe61d6` |
| #34 Push trigger was a 12-call-site convention; now a mutation event bus (`src/db/mutationEvents.ts`) | Fixed `caca145` |
| #36 Sync engine imported UI for sign-out KV cleanup | Fixed `4c671ec` |
| #7 reconcileLocalRowId failure poisons an accepted push | Refuted by verification |
| #50 One HTTP request per outbox row, no coalescing | Deferred by design (coalescing has a data-loss race with in-flight push; symptom mitigated by debounce and #14) |
| #42 Transient-error classification implemented twice, already disagreeing (`src/sync/push.ts`, `src/core/syncHelpers.ts`) | Open (medium) |
| #43 Quarantine discard hand-duplicates the synced-table list; unknown tables lose the outbox row silently (`src/sync/quarantine.ts`) | Open (medium) |
| #9 Hot-path writes hand-roll the insert+outbox pattern in three copies (`src/queries/sets.ts` and siblings) | Open (low) |
| #10 Sync docs diverge from the implementation in ways a future sprint would trust | Open (low) |

### Data semantics (units, PRs, time, schema)

| Finding | Status |
|---|---|
| #131 (critical) Weights had no unit; toggling units reinterpreted all history (`src/core/units.ts`, `src/queries/sets.ts`) | Fixed `f76981f` (write side) + `0295643` (read side) |
| #133 Voice unit override parsed then dropped (`src/voice/dispatch.ts` `setValues`); dup #78 | Fixed `f76981f` |
| #134 Two devices on one account could write incomparable implicit units | Fixed `0295643` |
| #135 No unit suffix on any read surface (History, detail, recap) | Fixed `0295643` |
| #68 Default-unit disagreement: WorkoutActive fell back to lb, Profile and schema said kg | Fixed `0295643` |
| #132 PR detection compared raw numbers across unit epochs | Fixed `c0254f3` |
| #138 through #145, #148 PR lifecycle: phantom PRs, PK rewrite, LWW regression, stale-filter chart query | Fixed `c0254f3` (PR table demoted to a local derived cache, no longer synced) |
| #149 Progress chart bucketed days by UTC boundary (`src/queries/personalRecords.ts`) | Fixed `cfd509e` |
| #150 Rolling-24h day math contradicted History's local-calendar grouping | Fixed `cfd509e` |
| #152 No timezone test coverage | Fixed `cfd509e` |
| #56 (high) Any additive server column breaks pull on deployed clients: pull selects `*` and builds local INSERT columns from `Object.keys(r)` (`src/sync/pull.ts:110,153`) | **Open, no owner** |
| #57 (high) Local schema versioning is decorative: migrations are unconditional `tryAlter` calls that swallow every error (`src/db/client.ts:123`); `user_version` is read only to warn on downgrade (`src/db/client.ts:56`) | **Open, no owner** |
| #58 seed.sql collides with migration 00007's unique index; `supabase db reset` fails | Open (medium) |
| #59 Plan-slot constraints exist only in Postgres; two-device plan edits diverge locally | Open (medium) |
| #60 No bounds constraints on sets anywhere; fractional reps quarantine the row at push | Open (medium) |
| #61 RLS grants hard DELETE on every user table though sync depends on soft deletes | Open (medium) |
| #62 Migration 00005 embeds one user's personal program and email, and is not idempotent | Open (medium) |
| #151 Auto-title code is dead: the only `createWorkout` caller hardcodes 'Workout' (`src/queries/workouts.ts`) | Open (medium) |
| #154 Pull writes PostgREST `+00:00` timestamps into a `Z`-suffixed database; lexicographic ORDER BY footgun | Open (low) |
| #155 Day attribution inconsistent: History groups by `started_at`, the Repeat card counts from `ended_at` | Open (low) |
| #156 WorkoutActive title fallback shows the current day name, not the workout's start day | Open (low) |
| #63 Local schema is not the claimed 1:1 mirror; #64 outbox lacks a `(table_name, row_id)` index | Open (low) |

### Workout and voice state machine

| Finding | Status |
|---|---|
| #11 (high) Set writes never refreshed the active screen offline (dup #46) | Fixed `4890594` |
| #14 Long-press ramp incremented once while haptics fired every 200ms | Fixed `180ae19` |
| #19 Unvalidated keypad input flowed straight into SQLite and sync (`src/components/numericStepper.ts` `sanitizeNumber` now clamps) | Fixed `180ae19` |
| #15 Infinite setState loop when every set in the workout was completed | Fixed `180ae19` |
| #12 Dangling auto-staged incomplete sets persisted after finish (`finishWorkout` now prunes, `src/queries/workouts.ts`) | Fixed `4a27073` |
| #16 onComplete had no double-fire guard (swipe + voice "done" race) | Fixed `4a27073`, `9bf9511` |
| #13 Cursor repositioning via `findInitialCursor` jumped to the wrong exercise | Fixed `66e2f90` |
| #18 An exercise-less active workout could not be finished or discarded | Fixed `9bf9511` |
| #20 repeatLastWorkout cloned across N+1 transactions; crash mid-clone left a partial workout (`src/queries/repeatLastWorkout.ts`) | Fixed `ca56268` |
| #17 Rest-timer notification chain broke on remount | Fixed `934ec52` |
| #96 Voice session never stopped on unmount, background, or finish; mic stayed hot (`src/voice/useVoiceSession.ts`) | Fixed `d6d50e6` |
| #97 Re-entrant `engine.start()` leaked result listeners; later commands dispatched twice | Fixed `d6d50e6` |
| #99 Spoken "undo" reverted the wrong command after "done" or navigation | Fixed `d6d50e6` |
| #100 Control keywords matched anywhere in the transcript, silently dropping values | Fixed `37d2275` |
| #102 Common phrasings mis-parsed into wrong values instead of being rejected | Fixed `37d2275` |
| #84 Grammar tests covered only happy-path integers | Fixed `37d2275` |
| #105 Parsed rest duration was dropped; no voice path to skip rest | Fixed `27988a9` |
| #103 `add (.+)` catch-all created and synced custom exercises from any utterance starting with "add" | Fixed `27988a9` |
| #104 Every voice failure mode was silent (permission denial, engine errors, failed dispatches) | Fixed `c18d096` |
| #21 `advanceCursor` is dead code; real transition logic untested in screen callbacks (`src/components/activeSet.ts`, `src/screens/WorkoutActive.tsx`) | Open (low; test side is #77, high) |
| #106 en-US locale hardcoded; #107 engine confidence plumbed but ignored | Open (low, voice) |

### Performance

| Finding | Status |
|---|---|
| #47 (high) Logging one set invalidated all nine query roots, refetching the entire app | Fixed `a6a14d8` |
| #48 (high) useTheme returned a new object identity every render, defeating every `useMemo(makeStyles)` (`src/ui/useTheme.ts` cache) | Fixed `a6a14d8` |
| #51 pullOnce made 13 sequential network round trips on every foreground | Fixed `a6a14d8` |
| #46 (high) Offline set logging wedged on a spinner | Fixed `4890594` (dup of #11) |
| #49 Rest timer and voice partials live in the WorkoutActive root; whole-tree re-renders every second during rest | Deferred by design |
| #52 Full PR backfill re-runs once per app session (`src/screens/Progress.tsx` `prBackfilledFor` guard limits it) | Open (medium) |
| #53 Repeat-workout and plan save run one SQLite transaction per row through the global mutex | Open (low) |
| #54 Per-row stylesheet creation in list items; unvirtualized stagger-animated PR list | Open (low) |
| #55 Exercise search is an unindexable `LOWER(name) LIKE '%q%'` scan per debounced keystroke | Open (low) |

### Typing, boundaries, security

| Finding | Status |
|---|---|
| #35 (high) The "only sync/auth touch Supabase" invariant was prose, not lint | Fixed `68d9f1c` |
| #38 (high) AGENTS.md taught the deprecated theme and wrong SDK versions | Fixed `50e40d8` |
| #37 (high) Theme shim styled live chrome (with #23, #67) | Fixed `f65ba75` |
| #91 Root-level auth gate covering all routes (`app/_layout.tsx`) | Fixed `d61f04a` |
| #89 (high) Wildcard `exp://*` redirect allowlist in checked-in auth config (magic-link takeover vector) | Fixed `3c3ec8d` |
| #90 Sentry URL scrubbing targeted the wrong breadcrumb categories | Fixed `3c3ec8d` |
| #93 No auth rate-limit, OTP expiry, or send-frequency configuration | Fixed `3c3ec8d` |
| #92 Password sign-in shipped while every document described passwordless-only | Fixed `4639931` |
| #88 (high) Session JWT in plaintext AsyncStorage; `expo-secure-store` absent | **Blocked** (needs the dependency plus a device test; deliberate) |
| #39 `app/_layout.tsx` is composition root plus auth protocol plus boot orchestrator | Open (medium) |
| #40 Two canonical type homes (`src/core/domain.ts` vs `src/db/types.ts`) and a `SyncState` name collision | Open (medium) |
| #41 Pure logic split across four module homes; the rest-timer feature alone spans three directories | Open (medium) |
| #94 Magic-link exchange failures silently swallowed (`catch {}` in `handleUrl`, `app/_layout.tsx`; the comment claiming AuthProvider surfaces them is false, `src/auth/AuthContext.tsx` has no error field) | Open (low) |
| #95 `safeRoute()` is a bare type cast whose name invites use as a sanitizer; #45 it defeats typed routes for six known paths | Open (low) |
| #44 Dead and duplicated helpers: unused `src/core/format.ts` exports while screens re-implement them | Open (low) |
| #161, #162 Notification lifecycle premises | Refuted; hardening landed anyway in `934ec52` |

### Testing and release gates

| Finding | Status |
|---|---|
| #82 `npm run lint` was red (12 errors) | Fixed `902b8d4` (now 0 errors, 31 warnings) |
| #126 No CI | Fixed `53fa33c` (`.github/workflows/ci.yml`: typecheck, lint, test on every push/PR) |
| #120 (high) eas.json `"$VAR"` strings that EAS never interpolates would bake literal garbage into binaries | Fixed `b85e963` (hand-verified; no end-to-end EAS build yet, see §6 and §11) |
| #121 (high) `autoIncrement` with `appVersionSource: "local"` and a dynamic config errors production builds | Fixed `b85e963` |
| #122 `UIBackgroundModes ['fetch']` declared with no registered task (App Review rejection risk) | Fixed `b85e963` |
| #125 Android paper-configured but never built; #127 no backup/DR story for the Supabase mirror | Fixed `b85e963` (documented stance) |
| #77 (high) Real cursor logic (three regression commits) has zero tests; the tested function is dead code | **Open, no owner** |
| #79 (high) Pull cursor predicate test mocks away the very predicate it claims to test | **Open, no owner** |
| #80 (high) Sign-out teardown, the historically buggy db re-init zone, has no test (including the in-flight-pull race) | **Open, no owner** |
| #81 Push partial-failure semantics untested (skip-and-continue ordering, backoff gating) | Open (medium) |
| #83 finishWorkout-to-PR seam untested behind a silent catch | Open (medium) |
| #85 useVoiceSession confirm/undo/silence state machine untested despite its injectable engine seam | Open (medium) |
| #87 No render-level or e2e coverage; adopt Maestro for three named flows | Open (medium) |
| #86 expo-sqlite mock permits nested transactions production would reject | Open (low) |

## 4. UI/UX findings by screen

| Screen | Finding | Priority | Status |
|---|---|---|---|
| Global chrome | #23/#67/#37 Toast, SyncIndicator, ErrorBoundary pinned Forge-dark | P1 | Fixed `f65ba75`; verified all three now read `useTheme()` (`src/ui/ToastContext.tsx`, `src/ui/SyncIndicator.tsx`, `src/ui/ErrorBoundary.tsx`) |
| Global chrome | #22/#65 Typography split; Geist only where hand-passed | P1 | Partial `2521a49` (Text primitive + font sweep landed; the 7 swept screens still use raw `Text` in places; full migration open) |
| Global chrome | #26 Five divergent sheet implementations, no Sheet primitive | P2 | Deferred (needs simulator/visual QA) |
| Global chrome | #30 Icon language: emoji plus ad-hoc glyphs (`src/components/VoiceMicButton.tsx` holds the app's only emoji) | P2 | Deferred (visual QA) |
| Global chrome | #32 Mixed 16/20pt gutters; #33 brand mark underdelivers (rose-only medal, see §2) | P3 | Open |
| WorkoutActive | #25 Complete-set glow invisible, PR choreography dead | P1 | Partial `dd75760`: glow now visible (`GLOW_PEAK` 0.32/0.45 in `src/ui/completeSetChoreography.ts`); live PR-pill detection and the recap PR card still open (`SessionVolumeBar` never passes `isPR`, `SessionRecap` call site omits `prs`) |
| WorkoutActive | #24 Rest timer has no visible countdown, only a 2px line (`src/components/RestProgressBar.tsx`) | P1 | Deferred (needs simulator/visual QA) |
| WorkoutActive | #27/#116 Sub-44pt touch targets; header navigation out of the thumb zone | P2 | Deferred (44pt audit, visual QA) |
| WorkoutActive | #108 Effectively unusable with VoiceOver (swipe-only completion, flattened steppers) | P1 | Deferred (needs device) |
| WorkoutActive | #117 Dynamic Type will clip fixed-height controls | P2 | Deferred (needs device) |
| WorkoutActive | Voice error phase renders with a "✓ " prefix and the mic shows "Listening" after a permission denial (`src/components/ActiveSetCard.tsx` ternary; phase mapping in `src/screens/WorkoutActive.tsx`) | P2 | Open (post-review observation, see §5 journey 10) |
| ExercisePicker | #31 Dead-ends on no results; create-exercise reachable only by voice (`src/components/ExercisePicker.tsx`, `createCustomExercise` in `src/queries/exercises.ts`) | P1 | Open |
| Today | #111 CollisionSheet is a blocking modal with no escape (`src/components/CollisionSheet.tsx`) | P1 | **Open, no owner** |
| Today | #119 First run drops the user cold; most prominent element non-interactive | P2 | Open |
| Today | #114 Sync surfaces inconsistent (unexplained pulsing line, no path to diagnostics) | P2 | Open |
| QuarantineSheet | #115 "Discard all" destroys unsynced changes with one unconfirmed tap (`src/components/QuarantineSheet.tsx`) | P2 | Open |
| Profile | #158 Denied rest-alert permission is silent and permanent | P1 | Partial `934ec52`: `getRestAlertStatus()` capability exists (`src/lib/restNotifications.ts`); the Profile "Rest alerts" row is not wired (confirmed absent in `src/screens/Profile.tsx`) |
| Progress | #29 Chart is the weakest screen: no range/metric controls, no PR markers, exercise selection only via the PR list (`src/screens/Progress.tsx`) | P2 | Deferred (visual QA) |
| PlanSetup | #69 Plan mutation hooks drop the onError-to-toast idiom; save fails silently (`src/queries/plans.ts`) | P2 | Open |
| PlanSetup/Today | #109/#153 Plan never reaches Today; templates orphaned | P1 | Deferred (feature work) |
| Login | #92 Password path undocumented | P1 | Fixed `4639931` |
| Login | #94 Failed magic-link exchange swallowed; sent-state has no back/resend | P2 | Open |

## 5. Workflow findings: 18 journeys re-rated on current main

All evidence verified by reading `main` @ `c8412ae` on 2026-06-10.

| # | Journey | Rating | Sev | Note |
|---|---|---|---|---|
| 1 | First launch and onboarding | FRICTION | P2 | No onboarding flow under `app/`; the root gate (`app/_layout.tsx`) forces `/login` before anything, with no anonymous local mode despite local-first. Guidance is empty-state copy only (`src/screens/Today.tsx`, `src/screens/WorkoutActive.tsx`). |
| 2 | Magic-link auth end to end | FRICTION | P1 | Happy path solid (PKCE, root deep-link handler with double-mount guard). Failed code exchange is swallowed (`catch {}` in `handleUrl`, `app/_layout.tsx`; `src/auth/AuthContext.tsx` has no error field) and the "Check your email" state in `src/screens/Login.tsx` has no back or resend. |
| 3 | Starting a workout from Today | GOOD | (none) | Resume, repeat, and blank paths with snapshot-hydrated first paint (`src/ui/todaySnapshot.ts`). Only rough edge is the non-dismissable CollisionSheet (#111) in the 2+ active anomaly. |
| 4 | Adding an exercise mid-workout | GOOD | (none) | Debounced autofocus search; cursor lands on the new exercise's staged set (`pendingTargetWeId` in `src/screens/WorkoutActive.tsx`); single-transaction add (`addExerciseToWorkout`, `src/queries/exercises.ts`). |
| 5 | Logging a set | GOOD | (none) | Stepper with keypad and accumulator ramp (#14), input clamping (#19, `src/components/numericStepper.ts`), per-set unit stamping (#131), optimistic cache mirroring (`useUpdateSet`, `src/queries/sets.ts`). |
| 6 | Correcting a logged set | BROKEN | P1 | No path to edit, un-complete, or delete a banked set: ghost rows are non-interactive (`src/components/ActiveSetCard.tsx`), `src/screens/HistoryDetail.tsx` is render-only, `useDeleteSet`/`useAddSet` (`src/queries/sets.ts`) have zero UI consumers (grep verified). Voice undo covers only the immediately preceding voice command. |
| 7 | Starting the rest timer | FRICTION | P2 | Auto-start, per-exercise overrides, crash-safe restore all work (`src/ui/restOverrides.ts`, `src/ui/hooks/restTimerPolicy.ts`); the only in-app surface is a 2px bar with no numeric countdown (#24). |
| 8 | Timer notification when backgrounded | FRICTION | P2 | Granted path correct end to end, including cold-start tap routing (`src/lib/restNotifications.ts`, `app/_layout.tsx`). After denial, scheduling silently returns null and the Profile "Rest alerts" row does not exist (#158 partial). |
| 9 | Voice logging a set | GOOD | (none) | Confidence-gated dispatch, confirm flow, undo, silence timeout, lifecycle stops, re-entrancy guard, spoken units honored (`src/voice/useVoiceSession.ts`, `src/voice/dispatch.ts`). |
| 10 | Voice degradation | FRICTION | P2 | Unavailable engine and permission denial surface correctly; but the error phase renders with a "✓ " prefix (`src/components/ActiveSetCard.tsx`) and maps to the mic's "Listening" visual (`src/screens/WorkoutActive.tsx`); no route-to-Settings affordance. |
| 11 | Completing a workout and recap | FRICTION | P2 | Recap is good (`src/ui/SessionRecap.tsx`; `finishWorkout` prunes dangling sets, #12). The natural path always interposes a destructive-styled "Skip this set?" alert, and the recap PR card never renders (call site omits `prs`). |
| 12 | History and past session | GOOD | (none) | Grouped SectionList with infinite pagination and pull-to-refresh (`src/screens/History.tsx`); detail renders each set in the unit it was logged in (`src/screens/HistoryDetail.tsx`, #131/#135). |
| 13 | Progress charts | FRICTION | P2 | One chart, heaviest weight per local day (`getHeaviestWeightHistory`, `src/queries/personalRecords.ts`, #149 fixed); no chart for exercises without a PR, no range or metric controls (#29). |
| 14 | Viewing personal records | GOOD | (none) | Three PR types per exercise in display units, recent-PR dot, serialized one-time backfill (`useGroupedPRs`, `recomputeAllPRs` in `src/queries/personalRecords.ts`). |
| 15 | Setting up a training plan | FRICTION | P1 | Setup and display work (`src/screens/PlanSetup.tsx`, `src/screens/TrainingPlan.tsx`) but the plan never reaches Today: no screen calls `createWorkout` with a `templateId` (grep verified), so the plan is decorative (#109/#153). |
| 16 | Switching skins | GOOD | (none) | All four skins with live swatch previews (`src/screens/Profile.tsx`), instant apply and AsyncStorage persistence (`src/ui/SkinContext.tsx`), no default-skin flash (boot gate on `hydrated`). |
| 17 | Adding a custom exercise | FRICTION | P1 | `createCustomExercise` exists (`src/queries/exercises.ts`) but its only caller is the voice fallback (`src/voice/dispatch.ts`); the picker has no create row, so a typed search for an unknown exercise dead-ends (#31). |
| 18 | Operating fully offline | GOOD | (none) | Local reads, single-transaction row+outbox writes, offline push skip (`startSyncEngine` in `src/sync/engine.ts`), offline staged-set refresh fixed (#11), session restores without network, quarantine has UI. Caveats: first sign-in requires network; #50 coalescing deferral stands. |

**Interaction costs (traced through the actual components, assuming a persisted session):**

- **Cold launch to first logged set: 2 interactions for a returning user.** Tap the RepeatCard (`src/screens/Today.tsx`, seeds weight and reps from the last completed sets via `src/queries/repeatLastWorkout.ts`), then swipe up on the ActiveSetCard. The new-user blank-workout variant is about 8 interactions plus 10 keystrokes.
- **Adding an exercise mid-workout: 2 taps plus typing.** The search field autofocuses (`src/components/ExercisePicker.tsx`) and the sheet closes itself on selection.
- **Marking a set complete: 1 swipe**, past the 60px `COMPLETION_THRESHOLD` in `src/components/ActiveSetCard.tsx`. There is no button alternative on the card; voice "done" is the only other path (relevant to #108 and #27).
- **Finishing a workout: 3 taps in the common case.** The "Skip this set?" alert is unavoidable on the natural path because the auto-staged set copies weight and reps, so `isUnmodified` is false in `onNextExercise` (`src/screens/WorkoutActive.tsx`).
- **Repeating yesterday's workout: 1 tap** on the RepeatCard.

**Signature moments, current state:** the set-completion choreography is real and skin-correct after `dd75760` (rigid haptic at the threshold, medium on release, 600ms volume count-up, visible accent glow at peak 0.32, `src/ui/completeSetChoreography.ts`), but the PR-strength variant is never exercised live because `SessionVolumeBar` calls `pulse()` without `isPR` and PR detection happens only at finish (`recordWorkoutPRs`, `src/queries/workouts.ts`). The recap (`src/ui/SessionRecap.tsx`) lands well, but its PR card never renders since the call site omits the `prs` prop, and the recap is not revisitable after finish. Voice state is visible through a five-phase machine surfaced on the card and the mic button, with the two error-phase seams noted in journey 10.

## 6. Build and type verification (Stage 6, run on main @ c8412ae)

| Check | Result |
|---|---|
| `npm ls --depth=0` | PASS, lockfile consistent |
| `npx tsc --noEmit` | PASS, exit 0 |
| `npx eslint .` | PASS, exit 0; 0 errors, 31 warnings (new react-hooks rules: set-state-in-effect, immutability) |
| `npx jest` | PASS, 58 suites, 439 tests, 0 failures, 5.98s |
| `npx expo config --json` | PASS, config resolves |
| `npx prettier --check .` | 111 files with style issues (format gate deliberately excluded from CI when CI was added in #126) |
| EAS build dry run | NOT executed (requires EAS credentials); `eas.json` was repaired and hand-verified in `b85e963` (#120, #121, #122). Unresolved: needs the local environment. |

## 7. Documentation mismatches corrected

The naming and copy sweep (2026-06-10) and the Phase 4 doc reconciliation produced the following state:

- **Shipping config is fully FlexYug-branded.** `app.config.ts` carries `name: 'FlexYug'`, `slug`/`scheme` `flexyug`, bundle ids `com.mokshlabs.flexyug`, and FlexYug permission strings. Zero `vyayamy` hits in tracked `src/`, `app/`, `eas.json`, `package.json`, or `supabase/`.
- **Legitimate repo-handle references stand** with explicit disclaimers in `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, and `docs/threat-model.md`. The improvement plan's 128 hits are absolute file paths containing the directory name.
- **Remaining product-name misuse (open):** the four `.cursor/rules/*.mdc` convention docs say "Vyayamy" as the product, and `.cursor/rules/supabase-patterns.mdc:47` is doubly stale (claims a `vyayamy://auth-callback` scheme; the real redirect derives from `scheme: 'flexyug'` via `Linking.createURL('/login')` in `src/screens/Login.tsx`). Two archived voice docs also use the old name (low priority).
- **Living-docs reconciliation done:** `d497691` reconciled ARCHITECTURE.md's styling and boundary sections with the code (#73); `50e40d8` corrected AGENTS.md's deprecated-theme and SDK-version guidance (#38); `68d9f1c` turned the Supabase-boundary invariant from prose into lint (#35).
- **Glossary (#70) is still open:** "SESSION VOLUME" renders to users (`src/ui/SessionRecap.tsx`, `src/components/SessionVolumeBar.tsx`), "Programs" is a visible heading (`src/screens/PlanSetup.tsx`), and preset blurbs in `supabase/migrations/00008_seed_plan_presets.sql` say "sessions" for workouts. `docs/overview.md` violates its own glossary in surrounding prose.
- **Copy debt catalogued, not yet fixed:** "+ Blank" (`src/screens/Today.tsx`), "Back to Today" vs its own lowercase a11y label (`src/screens/WorkoutActive.tsx`), `title="Generic"` (`src/screens/PlanSetup.tsx`), raw `Error.message` reaching toasts (`src/queries/workouts.ts`, `src/queries/repeatLastWorkout.ts`), inconsistent empty-state punctuation, and the app's only emoji (`src/components/VoiceMicButton.tsx`). The dominant conventions are otherwise sound: sentence-case actions, tracked ALL-CAPS eyebrows matching `src/ui/textVariants.ts`, and Cancel-plus-specific-verb confirm dialogs.
- **Em dashes in UI strings (four sites, fixed with this document):** the password placeholder in `src/screens/Login.tsx`, the Forge blurb in `src/ui/skins.ts` (rendered in the skin picker), the voice confirm strip in `src/components/ActiveSetCard.tsx`, and a config-error string in `src/auth/supabase.ts` were corrected in the same commit that introduces this review. Standalone missing-value glyphs (`formatDuration`/`formatWeight` in `src/core/format.ts` and friends) are a deliberate convention, not prose. The roughly 150 em dashes the living docs carried (README, design-system, ARCHITECTURE, local-first-sync, overview, AGENTS, operations, threat-model) were also removed in that reconciliation.

## 8. High-priority fixes: done and remaining

### Done (merged to main, Phases 0 through 4)

- **Phase 0, data integrity:** units end to end (#131 #132 #133 #134 #135 #68 #78 in `f76981f`, `0295643`); outbox ordering and row-count verification (#0, `548804a`); pull fault isolation and transient classification (#2 `e35a831`, #3 `be3842a`, #8 #4 `3fe61d6`); PR demotion to a local derived cache (#138 through #145, #132, #148, `c0254f3`); sign-out race (#1, `efb547e`); backoff wake-up (#5, `f77fad2`); cascading quarantine discard (#6, `76cb905`).
- **Phase 1, core loop:** offline screen freshness (#11/#46, `4890594`); stepper ramp, validation, loop (#14 #19 #15, `180ae19`); staged-set lifecycle and double-fire (#12 #16, `4a27073`); cursor jumps (#13, `66e2f90`); stuck empty workout (#16 #18, `9bf9511`); atomic repeat (#20, `ca56268`); invalidation storm, theme identity, pull round trips (#47 #48 #51, `a6a14d8`).
- **Phase 2, one coherent object:** themed chrome (#23 #67 #37, `f65ba75`); Geist/Text sweep (#22, `2521a49`, partial); visible completion glow (#25, `dd75760`, partial); day-boundary and timezone fixes (#149 #150 #152, `cfd509e`).
- **Phase 3, periphery:** voice hardening (#100 #102 #84 `37d2275`; #96 #97 #99 `d6d50e6`; #105 #103 `27988a9`; #104 `c18d096`); notification lifecycle (#157 #159 #160 #163 #17, `934ec52`, #158 partial).
- **Phase 4, the spine:** CI (#126, `53fa33c`); lint green (#82, `902b8d4`); eas.json repair (#120 #121 #122 #125 #127, `b85e963`); auth and redirect hardening (#89 #90 #93 `3c3ec8d`, #92 `4639931`, #91 `d61f04a`); boundary enforcement and doc truth (#35 `68d9f1c`, #38 `50e40d8`, #36 `4c671ec`, #34 `caca145`, #73 `d497691`).

### Remaining P0/P1, open or blocked

| Finding | Why it is still open |
|---|---|
| #88 Plaintext session JWT in AsyncStorage | Blocked: needs `expo-secure-store` plus a device test; risk not yet formally accepted |
| #56 Schema-skew pull fragility (`src/sync/pull.ts`) | Open, no owner; any additive server migration breaks deployed clients |
| #57 Decorative local migrations (`src/db/client.ts` `tryAlter`) | Open, no owner |
| #77, #79, #80 Cursor logic, pull predicate, and sign-out teardown untested | Open, no owner; the three highest-leverage test gaps |
| #111 CollisionSheet blocking modal (`src/components/CollisionSheet.tsx`) | Open, no owner |
| #24 Rest-timer countdown | Deferred: needs simulator/visual QA |
| #108 VoiceOver unusability; #117 Dynamic Type | Deferred: needs device |
| #109/#153 Plan-to-Today loop | Deferred: feature work |
| #25 remainder (live PR pill, recap PR card); #22/#65 remainder (full Text-primitive migration) | Partial; deferred to visual QA |
| Journey 6: no set-correction path after completion | Open; product gap surfaced by the journey re-rating, hooks already exist (`useDeleteSet`, `src/queries/sets.ts`) |
| #31/journey 17: create-exercise unreachable from the picker | Open |
| Journey 2: swallowed auth errors, no resend (#94 adjacent) | Open |

## 9. Medium-priority improvements (P2) remaining

- **Sync/architecture hygiene:** unify transient-error classification (#42); cascade-safe quarantine table list (#43); decompose `app/_layout.tsx` (#39); one canonical type home and the `SyncState` collision (#40); consolidate pure-logic homes (#41).
- **Schema:** seed/migration collision (#58); plan-slot local constraints (#59); set bounds constraints (#60); revoke hard DELETE under RLS (#61); scrub migration 00005 (#62).
- **Testing:** push partial-failure semantics (#81); finishWorkout-to-PR seam (#83); useVoiceSession state machine (#85); render-level/e2e harness, Maestro for three named flows (#87).
- **UX:** sheet primitive (#26); 44pt audit (#27, #116); Progress chart uplevel (#29); icon registry (#30); first-run experience (#119); sync-surface coherence (#114); confirm on "Discard all" (#115); Dynamic Type (#117); silent plan-save failure (#69).
- **Consistency:** glossary violations (#70); sheet scaffolding duplication (#71); five duplicate date formatters (#72).
- **Performance:** per-session PR backfill (#52); WorkoutActive root re-renders (#49, deferred by design); outbox coalescing (#50, deferred by design pending a safe protocol).
- **Release:** privacy manifest vs Sentry reality (#123, blocked on an EAS build and store verification); OTA stance decision (#124); dead auto-title path (#151).

## 10. Polish and nice-to-have (P3) remaining

- **Code hygiene:** hand-rolled insert+outbox copies (#9); sync doc drift (#10); dead `advanceCursor` (#21); dead/duplicated helpers (#44); `safeRoute()` casts (#45, #95); `Theme` type and storage-key conventions (#74); error-toast idiom drift (#75); `nowIso()` drift and the lone `Alert.alert` (#76); test-mock transaction fidelity (#86).
- **Performance small-bore:** per-row transactions in repeat/plan save (#53); per-row stylesheet creation and the unvirtualized PR list (#54); LIKE-scan exercise search (#55).
- **Schema small-bore:** local mirror gaps (#63); outbox `(table_name, row_id)` index (#64).
- **Voice:** locale hardcoded to en-US (#106); confidence signal ignored (#107).
- **Time:** mixed timestamp formats from pull (#154); inconsistent day attribution (#155); title fallback day (#156).
- **UX/brand:** spacing-token bypass (#32); brand-mark underdelivery and skin-adaptive medal finishes (#33, capability built in `src/ui/Medal.tsx`, unwired); bare-number stepper when unfocused (#136); no weight bounds at the keypad (#137); silent PR-recording catch (#146); quarantine PR re-insert loop (#147); unregistered notification category (#164).
- **Release small-bore:** dead Vite config and wildcard `exp://` in `supabase/config.toml` (#128); unpinned Node across environments (#129); dark-only launch assets (#130).
- **Auth:** swallowed magic-link failure and the false comment (#94).
- **Copy:** the §7 copy-debt list and the glossary remainder (#70).

## 11. Risk areas: what could still fail silently in production

1. **Schema-skew pull (#56).** The next additive server column breaks pull on every deployed client; pull selects `*` and constructs local INSERTs from server keys (`src/sync/pull.ts`). This is the highest-probability future incident in the repo.
2. **Decorative local migrations (#57).** `tryAlter` swallows every error (`src/db/client.ts:123`), so a failed migration looks identical to a successful one; `user_version` only warns on downgrade.
3. **Untested sign-out teardown (#80).** The historically buggy db re-init zone, including the in-flight-pull race, has no test; a regression would surface as cross-account data residue.
4. **Plaintext JWT (#88).** Any device-level compromise reads the Supabase session token from AsyncStorage.
5. **Store path never executed end to end.** `eas.json` was repaired by inspection (`b85e963`) but no EAS build has run; the privacy manifest still declares zero collected data while Sentry ships user ids (#123). Both are blocked on credentials/devices, not on code.
6. **Outbox coalescing race (#50, deferred by design).** The known data-loss race with in-flight push is why coalescing was not shipped; the debounce mitigation caps the symptom but the per-row HTTP cost remains.
7. **Silent catches on derived data.** `finishWorkout`'s PR recording swallows all failures with no telemetry (#146, #83), and plan saves fail silently (#69).
8. **Prettier debt.** 111 files fail `prettier --check` with no CI gate; format-only diffs will keep polluting future reviews until the gate lands.

## 12. Recommended next steps, ordered by impact

1. **Harden the sync/schema seam before any server migration ships:** column-intersection on pull apply (#56) and real, error-surfacing local migrations (#57). These two are the only open items that can destroy deployed installs.
2. **Build the missing test spine:** real cursor-logic tests (#77), an honest pull-predicate test (#79), sign-out teardown including the in-flight-pull race (#80), push partial-failure (#81), then Maestro for the three core flows (#87).
3. **Close the two P1 product traps that need no new infrastructure:** an escape hatch on CollisionSheet (#111) and a set-correction path (journey 6; wire the existing `useDeleteSet`/un-complete hooks into ghost rows and HistoryDetail).
4. **Run the simulator/visual QA batch as one pass:** rest-timer countdown (#24), Profile "Rest alerts" row (#158 remainder), live PR pill and recap PR card (#25 remainder), Text-primitive completion (#22/#65), sheet primitive (#26), 44pt audit (#27/#116).
5. **Run the device/EAS batch as one pass:** `expo-secure-store` for the session token (#88), privacy manifest (#123), one full EAS build per platform, VoiceOver (#108) and Dynamic Type (#117) sweeps.
6. **Finish the orphaned features:** plan-to-Today loop (#109/#153), create-exercise from the picker (#31), auth error surfacing and resend on Login (journey 2, #94).
7. **One copy and consistency pass:** glossary (#70) and the §7 copy-debt list, then add `prettier --check` to CI once the 111-file reformat lands as its own commit.

---

*Maintenance note: finding numbers refer to the condensed inventory reproduced in the appendix of [docs/specs/2026-06-10-deep-review-improvement-plan.md](../specs/2026-06-10-deep-review-improvement-plan.md). When a deferred or open item closes, update its row here and in that appendix in the same commit. This document records the state of `main` @ `c8412ae`; it is a snapshot, not a living tracker.*
