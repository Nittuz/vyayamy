# Deep Review & Work-of-Art Improvement Plan

**Date:** 2026-06-10
**Method:** 16-dimension multi-agent review (316 agents, ~9.1M tokens): 12 planned dimensions + 4 gap dimensions surfaced by a completeness critic, every medium+ finding adversarially verified by independent agents instructed to refute it.
**Result:** 165 raw findings → 11 merged duplicates, 4 refuted, 29 unverified lows → **115 confirmed findings** (4 critical, 35 high).

---

## Verdict

FlexYug is **top-decile bones wearing a half-finished body**. The hard architectural decisions are right and unusually well-documented: a transactional outbox with server-owned `updated_at`, keyset pull pagination, column-level merge against pending writes, soft-delete tombstones with complete RLS coverage, a real token/skin system with WCAG tests across all eight palettes, pure-logic extraction with honest unit tests, and a runbook better than most funded teams have.

What keeps it pedestrian is consistent and fixable: **the centers of things were never finished**. The local-first promise is violated on the one screen the product exists for. The number the user records — the weight — has no defined unit. The two "signature moments" compute out to invisible. Seven of nine screens render the wrong typeface. The store build path has never been executed and contains two independent build-killers. And the failure paths of the sync engine — where local-first lives or dies — are a full grade below its happy path.

None of this requires redesign. The plan below is ~7–9 focused weeks to work-of-art; Phases 0–2 (~5 weeks) deliver the felt transformation.

---

## What is genuinely good (keep doing this)

- **Sync architecture** (ADRs 0001–0004): outbox over CRDT, server-owned timestamps, op-aware quarantine. The happy path is craftsmanlike.
- **Schema hygiene**: tombstones consistent end-to-end, migration 00009 is a textbook RLS hardening pass (verified: no remaining RLS gap), CSPRNG UUIDs.
- **Pure-logic extraction with real tests**: `restTimerPolicy`, `numericStepper`, `grammar`, `pr-detection`, `activeSet` — 372/372 tests pass in 9.3s against a real SQLite engine with deliberate race injection.
- **Interruption recovery**: kill the app mid-workout → Resume card; mid-rest → timer restores. Better than most shipped fitness apps.
- **The styled core**: Today + ActiveSetCard (82pt mono hero numerals, tracked eyebrows, ghost sets, log-damped swipe-to-bank) has a confident, opinionated voice.
- **Docs discipline**: glossary adherence better than most human teams; zero TODO residue; one `console.warn` in the whole tree.

---

## The five themes keeping it pedestrian

### Theme 1 — The local-first promise is broken at the core loop
Set writes never invalidate the query the active screen reads; the UI refreshes only when a network push succeeds. Offline — the product's reason to exist — the stepper goes dead and every completed set strands the user on a spinner (#11, #46). Voice writes bypass React Query the same way. Logging one set online invalidates **all nine query roots** (a whole-app refetch storm, #47) and each stepper tap enqueues + pushes one HTTP request (#50, #14).

### Theme 2 — The meaning of the data was never decided
- **Units (#131, critical):** `sets.weight` is a bare REAL. `profile.units` is a display label. There is *zero* conversion code in the repo. Toggling kg↔lb silently reinterprets every historical set, PR, and chart point; sets logged after a toggle are permanently mixed-epoch. The server defaults everyone to kg; `WorkoutActive` falls back to lb — the entire US market hits this mainstream, not edge-case.
- **PRs (#138–#145):** the PR table is a write-only cache — no event ever recomputes downward (deleted sets leave phantom PRs forever), two-device sync can rewrite the server PK and wedge pull, LWW lets a lower value clobber a higher one. Root cause: syncing a *derivable* table as first-class data.
- **Time (#149–#155):** three sprints invented three day-boundary conventions (UTC slice, local calendar, rolling 24h). An evening lifter's chart splits one workout across two days; Today says "today" while History says "Yesterday" about the same session.

### Theme 3 — Sync failure paths are a grade below the happy path
Outbox replays can violate per-row order under backoff, and PostgREST 0-row updates report success — the one true silent-data-loss hole (#0, critical). One poison row wedges a table's pull cursor forever and aborts all later tables (#2). A brief 5xx outage quarantines valid sets in ~30s (#3). Sign-out races in-flight sync (#1). Backoff retries are never woken by any timer (#5).

### Theme 4 — Split-brain design system (the cross-sprint fault line)
One sprint restyled the workout core (Geist tokens, static StyleSheets); the periphery still runs the older architecture — so **the app changes typeface as you navigate** (#22). The "to be deleted in Phase 3" theme shim still paints the toast, sync pill, and error screen Forge-dark in all skins and light mode (#23). The complete-set glow computes to ~5% opacity (invisible) and the entire PR choreography is dead code (#25). The rest timer — the most-stared-at element in a gym — is a 2px line with no countdown (#24). Five divergent sheet implementations (#26). Icon language is emoji + ad-hoc glyphs (#30).

### Theme 5 — The spine that prevents regression doesn't exist
No CI; `npm run lint` is red (12 errors), so any future gate is dead on arrival (#82, #126). The tested cursor function is dead code while the real cursor logic — three regression commits — has zero tests (#77). The pull-cursor test mocks away the very predicate it claims to test (#79). AGENTS.md — the literal input to every AI sprint — teaches the deprecated theme and wrong SDK versions (#38): **this is the mechanism that keeps producing the drift**. The store build has never run: `eas.json` bakes literal `"$VAR"` strings into binaries and `autoIncrement`+local-version-source errors outright (#120, #121). Boundaries are enforced by prose, and the prose has drifted (#35).

---

## The Plan

### Phase 0 — Data integrity (~2 weeks) · *the non-negotiables*

| # | Fix | Effort |
|---|-----|--------|
| #131 #132 #133 #134 #68 #135 | **Units ADR + canonical kg.** Store kg (matches server default), convert at UI/voice boundary, one-time migration under units-in-effect, round-trip display snapping (225 lb ↔ 102.06 kg must render 225 lb), version-gate the migration against old clients. Interim (ship this week): confirm-gate on the Profile toggle + unify the `'lb'` fallback to `'kg'`. | L |
| #0 | Outbox: per-row FIFO guard in the batch query + verify row counts on update (0 rows = failure, not success). | M |
| #2 #3 #8 #4 | Pull: per-table + per-row fault isolation; classify 5xx/429 as transient; cursor overlap rewind; move conflict snapshot inside the transaction. | M |
| #138 #139 #140 #141 #142 #143 #144 | **Demote `personal_records` to a local derived cache** (drop from SYNCED_TABLES, recompute from synced sets on finish/delete/pull). This single decision dissolves the PK-rewrite, LWW-regression, and zero-row-update findings. Make recompute authoritative (down as well as up), serialize through a mutex, stamp `achieved_at` from the achieving set. | M–L |
| #1 | Await in-flight cycles in `handleSignOut`; verify DB deletion succeeded; warn if outbox non-empty before sign-out. | M |
| #11 | Set writes invalidate the local detail query — offline logging works again. **Do this first; it's hours.** | S |
| #5 #6 | Push drain loop + backoff wake timer; cascading quarantine discard. | M |

### Phase 1 — The core loop earns "fast" (~1.5 weeks)

- **State machine**: staged-set contract + finish-time cleanup of dangling sets (#12); cursor fixes — prev-bounce, add-from-recap, all-complete infinite loop, double-fire guard (#13 #15 #16); stepper long-press ramp (#14); keypad clamping (#19); single-transaction repeat-clone (#20); escape hatch for exercise-less workouts (#18). Re-centralize transitions into the tested `activeSet.ts` module.
- **Perf**: one-line `useTheme` memo (#48); narrow post-push invalidation (#47); outbox coalescing per (table,row) (#50); concurrent pull, 13×RTT → ~1×RTT (#51); move the 1Hz rest tick out of the screen root (#49).
- **Notifications lifecycle** (#157–#163, #17): drop `allowProvisional` (it means iOS *never prompts* — rest alerts ship pre-muted), prime deliberately in Profile/pre-workout, hoist `setNotificationHandler` to app start, add a response listener (cold-start taps currently strand users), persist the notification id, surface denial with a Settings deep-link.
- **Time semantics** (#149 #150 #152): one `localDayKey`/`localDaysBetween` module; fix the UTC chart bucketing; pin `TZ` in jest in the same commit (the current suite *asserts the bug*).

### Phase 2 — One coherent object (~2 weeks) · *the visible transformation*

1. **Text primitives** (`<Title> <Body> <Label> <Numeral>` binding typography tokens) + full sweep — the identity exists on every screen, not two (#22).
2. **Kill the theme shim**: port Toast/SyncIndicator/ErrorBoundary to `useTheme`, delete `theme.ts` (#23).
3. **Rest timer as a moment**: large Geist Mono countdown, hairline progress, accent crossover + haptic at target (#24).
4. **Finish the signature moment**: perceptible glow peak (~0.35 accent alpha), wire the dead PR choreography (#25).
5. **One `<Sheet>` primitive** replacing five divergent modals (#26); 44pt touch-target audit (#27 #116); chart uplevel — mono ticks, nice-number algorithm, PR rings (#29); icon registry replacing emoji (#30); unify on `makeStyles` (#66).
6. **Calm failure UX**: tappable sync stripe → diagnostics (#114), confirm on Discard-all (#115), non-destructive collision resolution (#111), first-run empty state that *is* the start button (#119), create-exercise from empty picker (#31).

### Phase 3 — Trust the periphery (~1.5 weeks)

- **Voice** (#96 #97 #99 #100 #102 #103 #104 #105 #84): stop on unmount/background/finish; idempotent start (listener leak = double-logged sets); undo scoping; grammar — "two oh five", decimals, control-keyword precedence ("…for five done" currently drops the values); confirm-gate `add …`; surface every failure mode; voice rest-skip.
- **Accessibility** (#108 #117): WorkoutActive is near-unusable with VoiceOver — add accessible complete-set action, unflatten steppers, `minHeight` + `maxFontSizeMultiplier` strategy.
- **Close the plan loop** (#109 #153): Today resolves today's slot → "Scheduled: Push Day → Start". Plans/Templates is currently a fully built feature nothing consumes.

### Phase 4 — The spine (~1 week)

- **CI now**: fix lint (1 hr, #82), then `.github/workflows/ci.yml` running typecheck+lint+format+jest (#126); 3 Maestro flows for what jest can't reach (#87).
- **Seam tests where the repo historically bled**: live cursor logic (#77), sign-out teardown (#80), honest pull-predicate mock (#79), push partial-failure (#81), finish→PR seam (#83), voice confirm/undo machine (#85).
- **Schema evolution before the next server migration**: versioned local migration ladder (user_version is currently write-only theater, #57); pull-side column intersection so additive server migrations don't wedge every deployed client (#56); mirror plan-slot unique indexes locally (#59).
- **Boundaries as tooling**: `no-restricted-imports` on `@/auth/supabase` (#35); mutation-committed event bus replacing 13 hand-placed `void triggerPush()` (#34); user-scoped KV registry so sync stops importing UI (#36); **rewrite AGENTS.md + reconcile the two design docs** (#38 #73) — in this workflow the docs are load-bearing architecture.
- **Security**: pin the redirect allowlist — `exp://*` in prod config is a magic-link account-takeover vector (#89); encrypted session storage via SecureStore-keyed AES (#88); root-level auth gate for all deep-linked routes (#91); decide password vs passwordless and align docs (#92); fix Sentry breadcrumb scrubbing targets (#90).
- **Release rehearsal**: fix `eas.json` env + version source (#120 #121), drop dead `UIBackgroundModes` (#122), honest privacy manifest (#123), OTA decision as ADR 0005 (#124), explicit iOS-only stance (#125), Supabase backup/PITR story (#127) — then **one end-to-end `eas build --profile production` → TestFlight install**, which would have caught four of these on day one.

---

## Explicitly not worth doing (refuted or judged)

- ~~reconcileLocalRowId poisons accepted pushes~~ (#7 — control flow misread by reviewer)
- ~~Reduce Motion ignored by main animations~~ (#28 — RN's `useReducedMotion` handles the cited springs)
- ~~Sign-out leaks user A's notification into user B's session~~ (#161 — scenario overstated; covered by #160's id-persistence fix)
- Verifiers also downgraded several headline-sounding items to medium (JWT storage — real but requires a jailbroken/local attacker; invalidation breadth — wasteful but correct), and the phasing above reflects those adjusted severities.

## Suggested sprint cadence

Phase 0 alone makes the product honest. Phases 0–2 make it feel like a work of art. 3–4 make it *stay* one. Run each phase as its own branch with the Phase-4 CI bootstrapped **first** if you can tolerate one reordering — every later phase then lands gated.

---

*Appendix: complete verified findings inventory follows.*

## Appendix — Complete verified findings inventory

Status: ✅ confirmed by adversarial verification · ⚪ low-severity, unverified by design · ❌ refuted (listed for the record). Duplicate findings are folded into their canonical entry.


### CRITICAL

**#138 ✅ [pr-lifecycle-and-derived-data-invalidation|M]** PR subsystem is monotonic-only: no event ever recomputes downward, so phantom PRs are permanent *(verifier: high)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/pr-detection.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts`
  - Fix: Make upsertExercisePRs authoritative instead of monotonic: it already recomputes best metrics from all visible sets (personalRecords.ts:28-39), so write the recomputed value whenever it differs from the stored one (up OR down), and enqueue a soft-delete for any stored PR type with no remaining qualifying sets. Then wire recompute into the truth-changing events: deleteSet/updateSet/deleteWorkoutLocal know the affected exercise_id(s) — call upsertExercisePRs for them (workout delete can resolve exercise ids from its workout_exercises before tombstoning). For pull, collect distinct exercise_ids from changed sets rows during pullTable('sets') and recompute after the page commits. The keep-only-improvements behavior in detectNewPRs is fine for *celebration* UX at finish time, but the persistence layer must converge to the truth of the sets table.

**#139 ✅ [pr-lifecycle-and-derived-data-invalidation|M]** Two-device PR collision: composite upsert sends the local id in the payload, so the server row's PK gets rewritten and the other device's pull wedges permanently on idx_pr_unique
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts`
  - Fix: Three coordinated fixes: (1) strip `id` from the body of composite-target upserts in push.ts so the server keeps its existing PK on conflict (then .select('id') genuinely returns the canonical id and reconcile works); (2) extend reconcileLocalRowId to also run `UPDATE outbox SET row_id = ? WHERE table_name = ? AND row_id = ?` inside the same transaction; (3) make pull defensive for personal_records: before inserting a row whose id is unknown locally, delete/replace any local row with the same (user_id, exercise_id, type) — e.g., a personal_records-specific ON CONFLICT(user_id, exercise_id, type) DO UPDATE, or a pre-delete. (3) is required regardless, because already-deployed devices may hold divergent ids. Verify the PostgREST PK-rewrite behavior against a real Supabase instance, not a mock, before trusting the fix.

**#0 ✅ [sync-correctness|M]** Outbox replays out of per-row order and never verifies row counts — silent, permanent data loss
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts`
  - Fix: Two fixes, both needed: (1) enforce per-row ordering in the batch query — exclude any outbox row that has an earlier sibling for the same (table_name, row_id), e.g. `AND NOT EXISTS (SELECT 1 FROM outbox o2 WHERE o2.table_name = outbox.table_name AND o2.row_id = outbox.row_id AND o2.id < outbox.id)`; this makes a backing-off/quarantined head row block only its own row's later ops. (2) Chain `.select('id')` on update/delete pushes and treat an empty result as a failure (row missing on server), not success.

**#131 ✅ [units-of-measure-semantics|L]** Stored weights have no unit; toggling Profile units silently reinterprets every historical set, PR, and chart point
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Profile.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/profile.ts`
  - Fix: Make a documented decision: store all weights in canonical kg (matches the server signup trigger default 'kg' at 00001_initial_schema.sql:138-139) and treat profile.units as display-only, converting at the UI boundary (formatWeight for output, a parseWeight inverse for stepper/keypad/voice input, step = 2.5 kg or ~2.27 kg for a 5 lb step). Ship a one-time migration (local + Supabase) that converts existing sets.weight and personal_records.value rows using the profile.units value in effect at migration time, and record the choice in an ADR. A per-set unit column is the alternative but it pushes mixed-unit arithmetic into every PR/volume aggregation; canonical-kg is the smaller blast radius. Until that lands, at minimum gate the Profile toggle behind a destructive-style confirm explaining that historical numbers are not converted.


### HIGH

**#34 ✅ [architecture|M]** Sync trigger is a 12-call-site convention: every mutation must remember `void triggerPush()`, and queries<->sync are bidirectionally coupled *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/mutations.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts`
  - Fix: Make the trigger structural: enqueueMutation emits a 'local mutation committed' event (tiny pub/sub in src/db or src/lib, no sync import needed); startSyncEngine subscribes and debounces pushes. Delete all 13 `void triggerPush()` call sites and the @/sync/engine imports from src/queries. This converts a per-feature convention into a guarantee and restores one-way layering (queries -> db; sync -> db).

**#35 ✅ [architecture|S]** The core architectural invariant (only sync/auth touch Supabase) is documented as lint-enforced but no such rule exists, and the boundary has already drifted *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/.eslintrc.js, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/ARCHITECTURE.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx`
  - Fix: Add `no-restricted-imports` (or eslint-plugin-import zones) limiting '@/auth/supabase' to src/auth/** and src/sync/**. Expose the three auth operations screens actually need (signInWithOtp, signInWithPassword, signOut, exchangeCodeForSession) as functions from src/auth so the client object stays private. Fix the ARCHITECTURE.md sentence to match.

**#36 ✅ [architecture|S]** Sync engine imports the UI layer: sign-out cleanup requires the engine to enumerate every UI-owned AsyncStorage key *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/todaySnapshot.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/kvStore.ts`
  - Fix: Invert the dependency via src/lib/kvStore: add registerUserScopedKv(key, onClear?) and clearAllUserScopedKv(). todaySnapshot/restOverrides/restTimer register their keys (and the snapshot's in-memory cache reset) at module definition; handleSignOut calls the single clearAllUserScopedKv(). The sync engine's three @/ui imports disappear and new user-scoped storage is isolated by construction.

**#38 ✅ [architecture|S]** AGENTS.md — the file that steers every AI sprint — teaches the deprecated theme, pins wrong SDK versions, and states a component-layer rule the code violates
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/AGENTS.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/ARCHITECTURE.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json`
  - Fix: Treat AGENTS.md as code: update the styling golden path to useTheme()/makeStyles, correct SDK/RN versions (or drop exact pins in favor of 'whatever package.json says'), restate the components contract to match reality (query hooks allowed; @/db and @/auth/supabase forbidden), and sync ARCHITECTURE.md's provider tree and SDK references. Add a one-line check to the PR ritual: 'did this change invalidate AGENTS.md?'

**#66 ✅ [consistency-drift|L]** Two parallel styling architectures: makeStyles(theme) factories vs static StyleSheet + inline theme arrays *(verifier: medium)*
  - Files: `src/screens/Today.tsx, src/screens/WorkoutActive.tsx, src/screens/History.tsx`
  - Fix: Pick one blessed pattern (the makeStyles(theme) factory is the better of the two — single style source, tokens usable in StyleSheet) and document it in design-system.md with a real useTheme example. Migrate Today.tsx and WorkoutActive.tsx first (they are the flagship screens and the worst offenders), converting raw spacing to theme.space tokens (20→space.page/s5, 16→s4, 8→s2, 24→s6, 32→s8) and the off-scale borderRadius 10 (Today.tsx:506, WorkoutActive.tsx:562,569, RestOverrideSheet.tsx:215) to radius.button/sm/md. Components can follow incrementally.

**#56 ✅ [data-schema|M]** Any additive server column migration breaks pull on every deployed client (schema-skew fragility)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts`
  - Fix: Make pull tolerant of skew: cache each table's local column set via PRAGMA table_info at pull start and intersect server row keys with it before building the INSERT (unknown server columns are simply dropped — safe because the next binary re-pulls them after its own migration, since the cursor only advances on updated_at). Also wrap each pullTable call in its own try/catch so one table's failure doesn't stall the other twelve. Optionally strip unknown columns on push symmetrically. Add a test: pull a server row containing an extra column against the current local schema.

**#57 ✅ [data-schema|M]** Local schema 'versioning' is decorative: user_version is written but never read, and tryAlter swallows every error *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/client.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/local-first-sync.md`
  - Fix: Replace with a versioned migration ladder: `const MIGRATIONS: Record<number, string[]> = { 2: ['ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT'], ... }`; in initDb read user_version, run only steps for versions > current inside a transaction, then set user_version — so the stamp actually means something. In tryAlter (or its replacement), only swallow errors whose message matches /duplicate column name/ and rethrow everything else (surface via Sentry). Add a jest test (better-sqlite3) that creates a v1 database file and asserts initDb upgrades it to the current schema. Document the add-a-column recipe in docs/local-first-sync.md.

**#157 ✅ [notifications-permission-and-response-lifecycle|M]** allowProvisional means iOS never actually prompts — rest alerts are delivered quietly (no sound, no banner, no lock screen), defeating the feature's stated purpose
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Separate priming from scheduling. Add an explicit prime surface: a 'Rest alerts' row in Profile (src/screens/Profile.tsx) and/or a one-time inline card shown when a workout starts (before the first set), with copy like 'Get an alert when rest ends, even with your screen locked' and a button that calls requestPermissionsAsync WITHOUT allowProvisional so the real iOS dialog appears at a deliberate moment. scheduleRestDone should only CHECK permission (getPermissionsAsync), never request. Treat PROVISIONAL as a degraded state (quiet-only) and surface an upgrade hint rather than counting it as fully configured.

**#158 ✅ [notifications-permission-and-response-lifecycle|M]** Denied permission is silent and permanent: no surfaced state, no settings deep-link, and requestPermissionsAsync re-awaited on every set completion *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Profile.tsx`
  - Fix: Track a tri-state (unknown / granted-or-provisional / denied) and export it (e.g., getRestAlertStatus()). When denied: (a) short-circuit scheduleRestDone without the requestPermissionsAsync round-trip; (b) surface it once — a small line under RestProgressBar or a Profile 'Rest alerts: off' row — with a button calling Linking.openSettings(). Re-derive the state via getPermissionsAsync on AppState 'active' so a Settings grant is picked up the same session.

**#47 ✅ [performance|S]** Every successful push invalidates all nine query roots — logging one set refetches the entire app *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/keys.ts`
  - Fix: After fixing finding 1, stop invalidating after push entirely (or restrict it to ['personal_records'] when reconcileLocalRowId actually ran). Keep broad invalidation only after pull, ideally narrowed to the tables the pull actually wrote (pullTable knows). This is a ~10-line change with the single largest perf payoff in the app.

**#48 ✅ [performance|S]** useTheme returns a new object identity every render, silently defeating all nine useMemo(makeStyles, [theme]) sites *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/useTheme.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/PlanSetup.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/History.tsx`
  - Fix: One-line fix: `return useMemo(() => ({ color, space, radius, touch, font: typography, motion, scheme }), [color, scheme])` in useTheme (color is already a stable module-level reference per skin×scheme). Optionally go further and hoist makeStyles results into a module-level Map keyed by skin+scheme so styles are computed once per appearance, ever.

**#140 ✅ [pr-lifecycle-and-derived-data-invalidation|M]** Two-device LWW silently regresses PRs: the later push wins even when its value is lower, and the pull then destroys the correct value on the first device
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts`
  - Fix: Stop treating personal_records as first-class LWW data. The cleanest fix dissolves this and finding #2: remove personal_records from push/pull entirely (drop from SYNCED_TABLES) and recompute it locally from synced sets after every pull and every set mutation — sets are the facts, PRs are a derived cache, and the sets already sync correctly. If syncing PR rows must stay (e.g., for instant PRs on a fresh device), add a server-side BEFORE UPDATE trigger that keeps the better value per type (GREATEST for scalars, reps-then-weight comparison for most_reps_at_weight), and apply the same domain-aware comparison when pull merges a personal_records row into a local one.

**#141 ✅ [pr-lifecycle-and-derived-data-invalidation|S]** recomputeAllPRs racing recordWorkoutPRs can throw UNIQUE-constraint on first-ever PRs, silently aborting PR recording for the rest of the workout *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/transaction.ts`
  - Fix: Serialize all PR recompute through one module-level async mutex in personalRecords.ts (a simple promise-chain queue around upsertExercisePRs). Do NOT reach for withTransaction around the read+write — enqueueMutation already takes the app-wide non-reentrant transaction lock (transaction.ts:19,26-36) and wrapping would deadlock. Per-exercise granularity is fine; the goal is that read-existing → enqueue is atomic with respect to other PR recomputes. Also make the insert path tolerant: on UNIQUE failure, re-read and convert to an update instead of aborting the loop.

**#142 ✅ [pr-lifecycle-and-derived-data-invalidation|M]** achieved_at is stamped with detection time, not achievement time — backfill marks years-old PRs as 'recent', and the recompute path nulls workout_id provenance
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx`
  - Fix: Extend the metrics query to select s.completed_at and s.id, and have computeBestMetrics carry the argmax set for each metric (pr-detection.ts:24-49 — add the achieving set to BestMetrics). Write achieved_at from that set's completed_at and populate set_id/workout_id from it (the set's workout is derivable in the same join, removing the need to pass workoutId at all and unifying recordWorkoutPRs/recomputeAllPRs). Only overwrite workout_id/set_id when the new achieving set is known; never null them from the recompute path.

**#108 ✅ [product-ux|M]** WorkoutActive is effectively unusable with VoiceOver: set completion is swipe-only and the weight/reps steppers are flattened behind a parent Pressable
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/ActiveSetCard.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/ToastContext.tsx`
  - Fix: 1) Add accessibilityActions={[{name:'activate', label:'Complete set'}]} + onAccessibilityAction calling handleComplete on the card, or render a plain 'Complete set' button (it can be visually subordinate to the swipe). 2) Replace the focus-clearing Pressable with a View + onStartShouldSetResponder, or set accessible={false} on it so the steppers surface individually. 3) Announce completions and toasts with AccessibilityInfo.announceForAccessibility.

**#109 ✅ [product-ux|L]** Plans/Templates are an orphaned feature: nothing ever starts a workout from a template, and Today never reads the plan it promises to use
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/TrainingPlan.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts`
  - Fix: Close the loop: on Today, query useActivePlan, resolve today's Slot (weekly: day_of_week; cycle: position cursor), and render a 'Scheduled: Push Day → Start' card above/in place of RepeatCard that creates a workout seeded from the template's exercises (wire createWorkout's templateId + seed workout_exercises). Until that exists, rename the 'Templates' button to 'Plan' so it doesn't promise template-starting it can't do.

**#111 ✅ [product-ux|M]** CollisionSheet is a blocking modal with no escape that forces permanent destruction of one of two real workouts
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/CollisionSheet.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx`
  - Fix: Make it non-blocking (dismissable; show a banner like the quarantine one until resolved), replace destructive 'discard the rest' on Resume with 'mark the others finished' (set ended_at) so no sets are lost, and keep explicit Discard behind a confirm Alert.

**#120 ✅ [release-ops|S]** eas.json env blocks use "$VAR" strings that EAS does not interpolate — store builds bake literal garbage into Supabase URL/key and Sentry DSN
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/eas.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/auth/supabase.ts`
  - Fix: Delete the env blocks from eas.json entirely. Define EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN, SENTRY_* per environment with `eas env:create` (or the expo.dev dashboard) and bind each build profile with the `environment` field ("development"/"preview"/"production"). For submit, put real values for appleId/ascAppId/appleTeamId in eas.json (they are not secrets) or use the EXPO_APPLE_ID env var. Then run one `eas build --profile production --platform ios` end-to-end and smoke-test the artifact — that single run would have caught this.

**#121 ✅ [release-ops|S]** autoIncrement with appVersionSource:"local" and a dynamic app.config.ts — production builds error out at version resolution *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/eas.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts`
  - Fix: Set cli.appVersionSource to "remote" in eas.json and keep autoIncrement: true on production — EAS then owns buildNumber/versionCode and app.config.ts keeps the marketing version. Document in docs/operations.md that step 4 of the release checklist (operations.md:190) bumps only the marketing `version`; build numbers are remote.

**#88 ✅ [security-privacy|M]** Supabase session JWT stored in plaintext AsyncStorage; expo-secure-store absent and risk never formally accepted *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/auth/supabase.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/threat-model.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json`
  - Fix: Implement the standard Supabase RN pattern: an encrypted storage adapter that keeps an AES key in expo-secure-store (iOS Keychain, kSecAttrAccessibleAfterFirstUnlock) and the encrypted session blob in AsyncStorage (Keychain has a ~4KB practical limit; sessions can exceed it). Migrate any existing plaintext session on first launch, then delete the old key. Alternatively, if you deliberately accept this, add a 'Session token at-rest' risk-acceptance section to threat-model.md with rationale — right now the doc promises a posture the code doesn't have.

**#89 ✅ [security-privacy|S]** Wildcard redirect allowlist (`exp://*`) in checked-in auth config is a magic-link account-takeover vector if it reaches production *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/config.toml, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx`
  - Fix: Keep `exp://*` (and ideally `flexyug://*`) out of any config that can reach production: pin the prod allowlist to the exact callback (`flexyug://login`), and either split config.toml per-environment (supabase CLI supports `--workdir`/env overrides) or add a loud comment + checklist item that the dashboard allowlist must NOT mirror this file. Verify the current hosted project's Redirect URLs today.

**#1 ✅ [sync-correctness|M]** Sign-out wipe races in-flight sync and silently keeps the previous user's database if deletion fails
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/client.ts`
  - Fix: Store the in-flight cycle promises (e.g., `currentPush: Promise|null`) in engine.ts and `await` them in handleSignOut before calling resetLocalDb. In resetLocalDb, verify deletion succeeded (re-open and assert a user table is empty, or check deleteDatabaseAsync's result) and on failure fall back to explicit `DELETE FROM <table>` for every synced table + outbox + sync_meta inside a transaction, reporting to Sentry instead of swallowing. A db 'generation' counter that invalidates stale handles would close the remaining race.

**#2 ✅ [sync-correctness|M]** Pull has zero fault isolation: one bad row wedges that table's cursor forever AND aborts all later tables
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts`
  - Fix: (1) Wrap each `pullTable` in try/catch so one table's failure doesn't starve the rest; record per-table lastError and report to Sentry. (2) Isolate row failures: catch per-row inside the loop (or use savepoints) so a poison row doesn't roll back the page or freeze the cursor. (3) For personal_records specifically, make the merge composite-key-aware: before inserting a server PR, delete/replace any local row with the same (user_id, exercise_id, type) but different id, mirroring the reconcile logic.

**#3 ✅ [sync-correctness|S]** HTTP 5xx/429 are classified as permanent failures — a brief Supabase outage quarantines valid user writes in ~30 seconds
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/adr/0002-outbox-over-crdt.md`
  - Fix: Capture the HTTP status (supabase-js response objects include `status`; pass it into the thrown error) and treat >=500 and 429 as transient. Alternatively whitelist permanent failures (Postgres constraint/RLS codes: 23xxx, 42501, PGRST1xx) and treat everything else as transient. Also lengthen the quarantine runway: 5 attempts capped at 30s total is far too fast for an offline-first product; consider MAX_ATTEMPTS ~8-10 with a backoff ceiling of minutes.

**#78 ✅ [testing-quality|S]** Voice unit override is parsed, tested, then silently dropped — 'aon hundred kilos' logs 100 lb for lb-profile users *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/dispatch.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/__tests__/grammar.setvalues.test.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts`
  - Fix: Add a seam test in dispatch.test.ts: dispatchCommand({kind:'setValues', weight:100, reps:5, unit:'kg'}, {...ctx, units:'lb'}) and assert the stored weight is converted (220.5) — it will fail today. Then implement the conversion in dispatch.ts setValues (kg→lb ×2.20462, lb→kg ÷2.20462, rounded to the UI step). Add the inverse-direction case and a no-unit case asserting passthrough.

**#79 ✅ [testing-quality|M]** Pull cursor predicate and pagination are decorative coverage — the test mock ignores the query entirely
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/__tests__/pull.test.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts`
  - Fix: Make the mock honest: parse the .or() predicate and actually filter/sort tableData by (updated_at, id); assert the exact predicate string on first call contains the EPOCH + ZERO_UUID sentinel. Export __setPullPageSizeForTests (same pattern as __setPushSleepForTests, push.ts:63) and add: (1) 3 rows / page size 2 → both pages applied, sync_meta cursor equals last row of page 2; (2) two rows sharing updated_at with cursor id between them → only the later id is applied; (3) simulate crash after page 1 (throw from page 2) → re-run pullOnce resumes from page-1 cursor without duplicating or skipping rows.

**#80 ✅ [testing-quality|M]** Sign-out teardown — the historically buggy db re-init zone — has no test, including the in-flight-pull race
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/client.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/__tests__/engine.test.ts`
  - Fix: Export handleSignOut (or the auth callback) for tests. Add: (1) regression test for 9a4f767 — sign out, then run any query (e.g. createWorkout) and assert no 'no such table' throw and that the outbox is empty; (2) KV cleanup — assert clearSnapshot/REST_TIMER_KEY/REST_OVERRIDES_KEY removed and queryClient.clear() called; (3) the race — start pullOnce against a hanging supabase mock, fire handleSignOut, release the pull, then assert the new DB contains zero rows from the old user. (3) will likely fail and force an actual cancellation token in pull/push — that is the point.

**#149 ✅ [time-and-timezone-semantics|S]** Progress chart buckets days by UTC boundary, then re-parses the date-only key as UTC midnight — wrong day labels and split daily-max for any user west of UTC
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx`
  - Fix: Bucket by LOCAL calendar day: derive the key from local components of `new Date(completed_at)` (e.g. `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`), and have the chart compute x as local midnight via `new Date(y, m-1, d).getTime()` instead of parsing the date-only string. Rename WeightPoint.achievedAt to `day` so the date-only string stops masquerading as a timestamp.

**#150 ✅ [time-and-timezone-semantics|S]** Rolling 24h-window day math (formatRelativeDate, daysSince) contradicts History's correct local-calendar grouping — same workout shows 'today' on Today and 'Yesterday' in History every morning
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/format.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx`
  - Fix: Create one canonical `localDaysBetween(iso, now)` helper using the local-midnight-anchor technique already in getDateGroup (format.ts:36-38), and route formatRelativeDate, Today.tsx daysSince/recentMeta, and the snapshot's daysAgo through it. Delete the floor-of-epoch-diff pattern everywhere.

**#22 ✅ [ui-craft|L]** Half the app renders in the system font — Geist is only applied where a fontFamily was hand-passed (ELEVATION #1: Text primitives)
  - Files: `src/screens/Progress.tsx, src/screens/History.tsx, src/screens/HistoryDetail.tsx`
  - Fix: Build 2-3 Text primitives (<Label>, <Title>, <Numeral>, <Body>) that bind variant → {fontFamily, size, tracking, lineHeight, textTransform} from typography.ts, then sweep every screen to use them and delete raw fontWeight styling. Set headerTitleStyle.fontFamily and tabBarLabelStyle.fontFamily in both layouts. This single move converts seven pedestrian screens into the same voice as Today and is the highest-leverage craft fix in the codebase.

**#23 ✅ [ui-craft|S]** Toast, SyncIndicator and ErrorBoundary are pinned to Forge-dark — broken in light scheme and in all three other skins
  - Files: `src/ui/ToastContext.tsx, src/ui/SyncIndicator.tsx, src/ui/ErrorBoundary.tsx`
  - Fix: Convert all three to useTheme(). ToastProvider and SyncIndicator are function components — trivial. ErrorBoundary is a class: wrap its fallback view in a small themed function component. Then delete theme.ts as the Phase-3 plan intended (only _layout.tsx's boot overlay legitimately needs the static palette). Also add accent/onAccent and danger pairs to contrast.test.ts.

**#24 ✅ [ui-craft|M]** The rest timer — the most-stared-at element in a gym — has no visible countdown, just a 2px line (ELEVATION #2)
  - Files: `src/components/RestProgressBar.tsx, src/ui/hooks/useRestTimer.ts, src/screens/WorkoutActive.tsx`
  - Fix: Work-of-art treatment: when timer.running, expand the strip into a slim rest bar — large Geist Mono countdown ('1:23 / 2:00'), the progress hairline beneath it, color crossing from inkSecondary to accent at target with the existing success haptic, a 44pt 'skip' on the right edge, and a small 'rest ·· 2:00' label that hints the long-press override. This is the cheapest place in the app to add a daily-felt moment of craft.

**#25 ✅ [ui-craft|M]** The signature complete-set moment is half-shipped: the glow is mathematically imperceptible and the entire PR choreography is dead code *(verifier: medium)*
  - Files: `src/ui/useCompleteSetAnimation.ts, src/components/SessionVolumeBar.tsx, src/ui/completeSetChoreography.ts`
  - Fix: 1) Give the glow a real value: a dedicated `glowPeak` derived at ~0.30-0.35 absolute accent alpha (e.g. soft(accent, 0.35)) animated 0→1→0, or briefly tint the volume numeral itself to accent. 2) Wire PR detection (compare banked set against personalRecords on complete — the queries already exist), pass isPR into computeChoreography, render the PR pill on SessionVolumeBar, and pass prs into SessionRecap so its already-built accent card finally renders. The choreography planner is unit-tested and waiting; only the plumbing is missing.

**#132 ✅ [units-of-measure-semantics|S]** PR detection compares raw numbers across unit epochs — a unit switch mints fake PRs or suppresses real ones, permanently
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/pr-detection.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Resolved automatically once weights are canonical-kg (finding 1). As an interim hardening, stamp the active unit into the PR value JSON ({ value: 100, unit: 'kg' }) so corrupted records are at least detectable and repairable by a later migration, and skip PR comparison when stored unit != current unit.

**#133 ✅ [units-of-measure-semantics|S]** Voice unit override is parsed, typed, then silently dropped — '100 kilos for 5' under an lb profile stores 100 unconverted
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/dispatch.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts`
  - Fix: In the setValues case of dispatchCommand, when `command.unit` is present and differs from ctx.units (or, post-finding-1, from canonical kg), convert the weight (lb→kg: ×0.45359237, kg→lb: ×2.20462) before updateSet, and include the unit in the feedback/pending strings ('100 kg × 5'). Add a dispatch test for the cross-unit utterance.

**#134 ✅ [units-of-measure-semantics|S]** Two devices on one account can write incomparable implicit units; the 'lb' fallback in WorkoutActive contradicts the kg default everywhere else *(verifier: medium)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00001_initial_schema.sql`
  - Fix: One-line fix now: change WorkoutActive.tsx:57 to `?? 'kg'` so all defaults agree with schema and server, and consider not rendering the weight stepper until profileQuery has resolved. The structural fix is canonical-kg storage (finding 1), which makes label divergence cosmetic instead of corrupting.

**#96 ✅ [voice-engine|S]** Voice session is never stopped on unmount, background, or workout finish — mic stays hot and commands dispatch into a dead screen
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/speechEngine.ts`
  - Fix: In useVoiceSession add `useEffect(() => () => stop(), [stop])` for unmount, and an AppState listener that calls stop() when state leaves 'active'. In WorkoutActive, call voice.stop() inside the onFinishWorkout callback and in onFinish before navigation. Optionally render a small 'listening' pill + stop control on the recap branch if you want voice to survive into it intentionally.

**#97 ✅ [voice-engine|S]** Re-entrant engine.start() leaks result listeners — every later command dispatches twice (double sets, double completes)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/speechEngine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/VoiceMicButton.tsx`
  - Fix: Make start() idempotent at both layers: in useVoiceSession, early-return if ui.phase !== 'idle'; in speechEngine.start(), remove any existing subscriptions before registering new ones (or return a handle per session instead of module state). Fix VoiceMicButton to distinguish hold-release from tap-release (e.g. track a longPressActive ref and only call onHoldEnd if a long press actually started).

**#99 ✅ [voice-engine|S]** Spoken "undo" reverts the wrong command after "done" or navigation — it wipes values off an already-completed set
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts`
  - Fix: Clear lastUndo.current whenever a non-data command executes (completeSet, nextExercise, prevExercise, finishWorkout, stop), and have onCompleteSet register its own undo (un-complete + delete the auto-staged set) so "undo" always targets the most recent action. Set the UI label to describe what was undone (e.g. 'Undid 185 × 5').

**#100 ✅ [voice-engine|M]** Control keywords match anywhere in the transcript, so "two twenty five for five done" silently drops the values — and voice "done" bypasses the canComplete guard, banking empty sets
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/ActiveSetCard.tsx`
  - Fix: Two fixes: (1) in grammar.ts, try the value-bearing patterns (connector, reps-only) BEFORE the bare control-keyword scan, or anchor completeSet to short utterances (e.g. ^(done|got it|...)$), and ideally emit a combined {setValues + completeSet} command for compound utterances since 'X for Y, done' is the single most natural gym phrasing; (2) in WorkoutActive's onCompleteSet/onComplete, refuse (with spoken-feedback label 'Set has no values') when weight or reps is null, matching the canComplete invariant.

**#102 ✅ [voice-engine|M]** Common phrasings mis-parse into wrong values instead of being rejected — "two oh five for three" logs 2 × 3 at high confidence
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/numberWords.ts`
  - Fix: Add 'oh'/'o' as a zero digit in the hundreds idiom (two-token treatment: unit + 'oh' + unit → a*100 + c). Add a reps-first pattern: /^(.*?)\breps?\b(?:\s+(?:at|with|on))\b(.*)$/ mapping group1→reps, group2→weight. Replace the wordsToNumber fallback sum (numberWords.ts:56) with `return null` — an unrecognized token sequence should be rejected, not summed into a plausible-looking wrong number.

**#11 ✅ [workout-state|S]** Set writes never refresh the active screen's query — offline, the workout UI freezes (stepper dead, infinite spinner after every completed set)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts`
  - Fix: Make set writes refresh local readers without the network: in useUpdateSet/useAddSet/useDeleteSet also invalidate queryKeys.workouts.withExercises (pass workoutId in the mutation vars, or invalidate the ['workouts','detail'] prefix), and have WorkoutActive's onComplete/onNextExercise invalidate detail after the raw addSet/updateSet calls. Better still, write-through to the detail cache (setQueryData) the way useUpdateSet already does for the sets key. Add a jest test that completes a set with sync offline and asserts the detail query data refreshes.

**#12 ✅ [workout-state|M]** Auto-staged 'next set' lifecycle is unfinished: dangling incomplete sets persist after finish, pollute history, and trigger a 'Skip this set?' alert on every normal exercise transition
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/HistoryDetail.tsx`
  - Fix: Pick a staged-set contract and enforce it: stage with weight/reps = null and render the previous set's values as ghost placeholder text (keeps isUnmodified semantics honest), and on finishWorkout soft-delete all incomplete sets of the workout inside the same enqueueMutation transaction (the cascade machinery in db/mutations.ts already shows the pattern). Then the skip alert can be reserved for sets the user actually edited.

**#13 ✅ [workout-state|S]** Cursor repositioning via findInitialCursor jumps to the wrong exercise: 'prev' bounces to the first dangling set in the workout, and add-exercise-from-recap lands on exercise 1 instead of the new exercise
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/activeSet.ts`
  - Fix: For prev: mirror the next-exercise logic — target prev's first incomplete set, staging one via addSet if none exists. For add-from-recap: set the cursor explicitly to the new workout_exercise's staged set (addExerciseToWorkout already returns the weId and stages a set, exercises.ts:106-110) instead of relying on findInitialCursor. Add unit tests for both paths against ExerciseShape fixtures with dangling staged sets.

**#14 ✅ [workout-state|S]** Long-press ramp on the stepper is broken: haptics fire every 200ms but the value increments once, while each tick enqueues a duplicate outbox mutation and push
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/NumericStepperView.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts`
  - Fix: Keep a local ref accumulator: initialize it from `value` when the ramp (or any tap) starts, apply steps to the ref, render from local state optimistically, and commit via onChange. Alternatively change the onChange contract to accept an updater function. Debounce the SQLite/outbox commit (the useDebouncedCommit machinery already exists in numericStepper.ts:64-121) so a ramp produces one outbox row, not dozens.


### MEDIUM

**#39 ✅ [architecture|M]** app/_layout.tsx is the composition root plus auth protocol plus boot orchestrator — PKCE code exchange and db-init racing live inline in a route file
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/_layout.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/auth/AuthContext.tsx`
  - Fix: Extract useAuthDeepLink() into src/auth (it is auth protocol, and pairs with the finding-2 facade) and useAppBootstrap() returning {ready, bootError} into src/ (e.g. src/lib/bootstrap.ts), each unit-testable. _layout.tsx shrinks to providers + Stack + BootOverlay (~90 lines), and boot-ordering rules get a named, testable home.

**#40 ✅ [architecture|S]** Two competing canonical type homes (core/domain.ts vs db/types.ts) and an exported name collision: two different `SyncState` types *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/domain.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/types.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/state.ts`
  - Fix: Rename the enum to SyncStatus (matching deriveSyncState's role) and update syncHelpers/SyncIndicator. Then pick one type home: either make core/domain the enforced import surface for row types (lint restricting @/db/types to src/db, src/core, src/sync) or delete the re-export block in domain.ts and accept db/types as canonical, leaving domain.ts purely for derived domain types (PRValue, SlotDraft, WorkoutSummary).

**#41 ✅ [architecture|M]** Pure logic has four competing homes (core, lib, ui, components); the rest-timer feature alone is smeared across four modules in three directories
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/restDefaults.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/restOverrides.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/restTimerPolicy.ts`
  - Fix: Adopt one rule and migrate: domain/feature logic and its persistence keys go to src/core (or a src/features/rest/ folder for the rest timer: defaults + overrides + policy + notifications together); src/ui keeps only rendering, tokens, and hooks that own Reanimated/RN handles; src/components keeps the convention 'component + its colocated pure logic' but document it in AGENTS.md so it reads as intent, not accident. Killing the ui->queries and sync->ui edges (finding 3) falls out of the same move.

**#42 ✅ [architecture|S]** Transient-sync-error classification is implemented twice and already disagrees ('pulloutbox' matches nothing)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/syncErrors.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/ToastContext.tsx`
  - Fix: Single classifier in src/sync (or src/core/syncHelpers next to deriveSyncState): export isTransientSyncError(err | message) used by both push.ts and useSyncAwareErrorToast. Delete src/ui/syncErrors.ts and the ToastContext re-export; drop the dead 'pushoutbox'/'pulloutbox' patterns.

**#43 ✅ [architecture|S]** Quarantine discard duplicates the synced-table list by hand; unknown tables silently lose their outbox row without local rollback, and UI copy lives in the sync layer
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/quarantine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx`
  - Fix: Derive the discard-safe set from SYNCED_TABLES minus an explicit READ_ONLY_TABLES const declared beside it in db/schema.ts (presets), so new tables are safe by default; alternatively make discard refuse (keep the outbox row) for unknown tables rather than dropping it. Move summarizeRow into QuarantineSheet, and register the quarantine query key in src/queries/keys.ts so Today.tsx stops duplicating the literal.

**#68 ✅ [consistency-drift|S]** Default units disagree: WorkoutActive falls back to 'lb', Profile and the DB schema say 'kg'
  - Files: `src/screens/WorkoutActive.tsx, src/screens/Profile.tsx, src/db/schema.ts`
  - Fix: Define a single `DEFAULT_UNITS = 'kg'` constant in src/core/domain.ts (matching the schema default) and use it in both screens; better, have useProfile expose a resolved `units` field so screens never apply their own fallback. Consider not rendering the stepper unit until profileQuery settles.

**#69 ✅ [consistency-drift|S]** plans.ts mutation hooks drop the onError-to-toast idiom — PlanSetup save fails silently
  - Files: `src/queries/plans.ts, src/screens/PlanSetup.tsx`
  - Fix: Add the standard `onError?: (msg: string) => void` parameter to both plan hooks with 'Failed to save plan' fallbacks, and pass a toast callback from PlanSetup (it can reuse useToast like Today.tsx:42-43). Wrap onSave's awaits so navigation only happens on success.

**#70 ✅ [consistency-drift|S]** Glossary violations: 'Session' component names/UI copy and 'Programs' UI copy contradict docs/overview.md
  - Files: `src/ui/SessionRecap.tsx, src/components/SessionVolumeBar.tsx, src/screens/PlanSetup.tsx`
  - Fix: Rename the components WorkoutRecap and WorkoutVolumeBar (both into src/components/), change copy to 'WORKOUT VOLUME', and change the PlanSetup group title from 'Programs' to e.g. 'Named plans'. The DB tier value 'program' can stay (renaming a CHECK-constrained seeded column isn't worth it) but document it as a sanctioned internal exception in overview.md, and fix the doc's own 'movements'/'Session depth' slips so future AI sprints don't inherit the synonyms.

**#73 ✅ [consistency-drift|S]** ARCHITECTURE.md and design-system.md describe two different design systems — future AI sprints will inherit the drift
  - Files: `ARCHITECTURE.md, docs/design-system.md, docs/overview.md`
  - Fix: Make design-system.md the single source of truth: rewrite ARCHITECTURE.md's styling section (lines ~83, 378-398) to point at it, fix the design-system example to use useTheme/makeStyles, and update overview.md's out-of-scope bullet to reflect the 4-skin reality. Cheap edit, outsized payoff for every future session.

**#58 ✅ [data-schema|S]** seed.sql collides with migration 00007's unique index — `supabase db reset` fails, and the two catalogs disagree on canonical names
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/seed.sql, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00007_seed_global_exercises.sql`
  - Fix: Delete seed.sql's exercise block entirely (00007 superseded it) or rewrite it as `ON CONFLICT ((lower(name))) WHERE user_id IS NULL DO NOTHING` with names reconciled to the 00007 catalog. Decide one canonical catalog and one canonical naming scheme; verify with a clean `supabase db reset --local`.

**#59 ✅ [data-schema|M]** training_plan_slots constraints exist only in Postgres — two-device plan edits diverge into local duplicates plus quarantined pushes *(verifier: high)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00003_training_plans.sql, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts`
  - Fix: Mirror the two partial unique indexes into LOCAL_SCHEMA_SQL (SQLite supports partial unique indexes), and make the pull merge for training_plan_slots tolerant (INSERT OR REPLACE keyed on the natural key, or detect-and-tombstone the loser by LWW on updated_at). Longer term, prefer deterministic slot ids (e.g. uuidv5 of plan_id+day) so concurrent rewrites converge to upserts instead of unique-key fights.

**#61 ✅ [data-schema|S]** RLS grants hard DELETE on every user table although sync correctness depends entirely on soft deletes
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00009_security_hardening.sql, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00004_sync_support.sql`
  - Fix: In a follow-up migration, replace each FOR ALL policy with explicit FOR SELECT / FOR INSERT / FOR UPDATE policies (same predicates) and define no DELETE policy — or simply `REVOKE DELETE ON <user tables> FROM authenticated`. This makes the 'soft deletes everywhere' invariant enforced rather than conventional.

**#62 ✅ [data-schema|S]** Migration 00005 embeds one user's personal program (and email) in the schema migration chain, and is not idempotent *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00005_seed_beyond_strength_phase1.sql, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00008_seed_plan_presets.sql`
  - Fix: Going forward keep migrations schema-only; the preset tables (00006/00008) are the right home for program content. Since 00005 has already been applied you can't delete it, but add an idempotency guard in a follow-up (or document that it must never be re-run), and consider a cleanup migration that no-ops it for fresh environments. Treat 00008's bail-out-if-any-row guard as the minimum bar for every future seed migration.

**#159 ✅ [notifications-permission-and-response-lifecycle|S]** No notification-response listener anywhere — tapping 'Rest complete' from a cold start strands the user on Today instead of the active workout
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/_layout.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/index.tsx`
  - Fix: Register Notifications.addNotificationResponseReceivedListener plus a cold-start check via Notifications.getLastNotificationResponseAsync() in the root layout effect (_layout.tsx), filtered on categoryIdentifier === 'rest-timer', and route imperatively: verify a session and an active workout exist, then router.push('/workout/active'). Deliberately do NOT implement this by embedding a flexyug:// URL in the notification payload and feeding it to Linking — that would route the tap through the deep-link surface already flagged as un-gated by the security pass; an imperative, auth-guarded push avoids it.

**#160 ✅ [notifications-permission-and-response-lifecycle|M]** Notification id lives only in an in-memory ref: after a process restart the restored timer can neither cancel nor deduplicate the still-pending OS notification, and start() chains are unserialized
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/restTimerPolicy.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: Persist the notification id inside PersistedTimer and re-adopt it on hydrate; or simpler and more robust, on hydrate (and on every start()) call Notifications.getAllScheduledNotificationsAsync() and cancel everything with categoryIdentifier 'rest-timer' before scheduling — this collapses both the restart-orphan and the race into one idempotent sweep. Add a monotonically-increasing token in start() so a stale chain's `.then` cannot clobber a newer id.

**#161 ❌ [notifications-permission-and-response-lifecycle|S]** Sign-out cleanup never cancels scheduled notifications — user A's 'Rest complete' fires into user B's session *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: In handleSignOut, add `Notifications.cancelAllScheduledNotificationsAsync()` and `Notifications.dismissAllNotificationsAsync()` to the existing Promise.all (engine.ts:120-124), wrapped in the same swallow-on-error style as cancelRest. Export a `cancelAllRest()` helper from restNotifications.ts so the engine doesn't import expo-notifications directly.

**#162 ❌ [notifications-permission-and-response-lifecycle|S]** Module-level `configured` flag caches a permission grant forever — revocation in iOS Settings mid-session is never re-detected and scheduling silently 'succeeds' *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: Split the concerns: keep a once-per-process flag only for setNotificationHandler registration (or hoist it entirely, see next finding), and call getPermissionsAsync on every scheduleRestDone — it is a cheap settings read, fine for a per-rest cadence. Return null when status is denied so callers see the same contract as first-time denial.

**#163 ✅ [notifications-permission-and-response-lifecycle|S]** setNotificationHandler is registered lazily inside the permission gate instead of at app start, so foreground notifications arriving before the session's first schedule are dropped
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/_layout.tsx`
  - Fix: Move Notifications.setNotificationHandler to module scope — top of restNotifications.ts outside any function, with the module imported from app/_layout.tsx, or directly in _layout.tsx alongside initErrorReporting() (line 28). Registration needs no permission; it is pure JS config. Delete the handler block from ensureConfigured.

**#49 ✅ [performance|M]** Rest timer and voice partials live in the WorkoutActive root — the whole screen tree re-renders every second during rest and on every speech partial
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/RestProgressBar.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Move elapsed-seconds state out of the screen root: have useRestTimer return start/stop plus a startedAt timestamp, and let RestProgressBar own the ticking — or better, drive the bar with a single Reanimated withTiming(1, {duration: targetSeconds*1000}) on the UI thread so zero JS re-renders occur during rest. Wrap ActiveSetCard in React.memo (its props are already stable callbacks). Isolate the voice partial label into a small subscribed component instead of screen-root state.

**#50 ✅ [performance|M]** Outbox push is one sequential HTTP request per row, and steppers enqueue one row per tap with no coalescing
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/NumericStepperView.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts`
  - Fix: Coalesce at enqueue time: when inserting an outbox 'update' row, merge its payload into an existing un-pushed update row for the same (table, row_id) instead of appending (preserves LWW semantics — same device, newer value). Additionally route stepper taps through the existing useDebouncedCommit (~300ms) so a burst of taps commits one SQLite write + one outbox row. Server-side batch RPC is optional after that.

**#51 ✅ [performance|S]** pullOnce makes 13 sequential network round trips on every app foreground, even when nothing changed
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts`
  - Fix: Run the per-table pulls concurrently (Promise.all over SYNCED_TABLES — each pullTable's network fetch is independent and local writes already serialize through the withTransaction mutex), which collapses 13×RTT to ~1×RTT. Skip preset tables after the first successful seed except on app-version change. Optionally chunk the 500-row page into smaller transactions so foreground writes can interleave during initial sync.

**#52 ✅ [performance|S]** Progress tab re-runs the full PR backfill (scan of every completed set per exercise) once per app session *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Persist the backfill marker durably (kvStore key like 'pr-backfill-done:<userId>') so the backfill runs once per install, not once per session. Keep the in-memory guard as a fast path. If you want belt-and-braces, also bump the key when PR detection logic changes.

**#143 ✅ [pr-lifecycle-and-derived-data-invalidation|S]** PR computation counts completed sets from unfinished workouts, so Progress-mount mid-workout mints PRs that discard/undo can never retract
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Add `AND w.ended_at IS NOT NULL` to the sets query in upsertExercisePRs, with the finishing workout allowed explicitly: pass workoutId through and use `AND (w.ended_at IS NOT NULL OR w.id = ?)` so recordWorkoutPRs still sees the just-finished workout (its ended_at update lands in the same call but ordering shouldn't be load-bearing). recomputeAllPRs passes null and naturally excludes in-progress data. Same guard belongs in its DISTINCT exercise scan (personalRecords.ts:105-113).

**#144 ✅ [pr-lifecycle-and-derived-data-invalidation|S]** PR 'update' ops are pushed by id and silently succeed against zero rows, losing improvements when local and server ids diverge
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Push personal_records updates through the same composite-key upsert path as inserts (the payload only lacks user_id/exercise_id/type — include them in the enqueued update payload, or special-case the table in push.ts to convert update→upsert). Alternatively, assert the affected-row count: `.select('id')` on the update and treat 0 rows as a non-transient error so it retries/quarantines visibly instead of vanishing. Note this finding becomes moot if personal_records stops syncing per finding #3's architectural recommendation.

**#145 ✅ [pr-lifecycle-and-derived-data-invalidation|M]** Reconciliation and lifecycle behavior are tested only against mocks that encode the assumptions under question; zero tests for any downward event
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/__tests__/prUpsertReconciliation.test.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/__tests__/personalRecords.test.ts`
  - Fix: Add lifecycle tests against the better-sqlite3 harness that already exists: (a) finish → deleteSet → recompute → assert PR lowered/removed (will fail until finding #1 is fixed — write it first as the spec); (b) pull merge of a personal_records row with same (user,exercise,type) but different id → assert no throw and single surviving row; (c) interleave recomputeAllPRs and recordWorkoutPRs on a fresh exercise → assert one insert and no lost exercises. For the PostgREST id-rewrite question, a one-off integration script against a local supabase instance is worth more than any further mock test — record the verified behavior in docs/local-first-sync.md.

**#114 ✅ [product-ux|M]** Sync surfaces are inconsistent: Today shows an unexplained 1px pulsing red line with no path to diagnostics, the SyncIndicator pill ignores the skin system, and the pulse loop never stops
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/SyncErrorStripe.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/SyncIndicator.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx`
  - Fix: Put the SyncIndicator pill on Today's top row (or make the stripe tappable to open SyncDiagnosticsSheet), migrate SyncIndicator to useTheme(), and stop loopRef in the timeout before resetting opacity.

**#115 ✅ [product-ux|S]** QuarantineSheet 'Discard all' permanently abandons unsynced changes with a single unconfirmed tap, adjacent to 'Retry all'
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/QuarantineSheet.tsx`
  - Fix: Wrap both discard paths in Alert.alert('Discard N unsynced changes?', …, destructive style), matching the existing skip-set confirm pattern.

**#116 ✅ [product-ux|M]** Primary in-workout navigation lives in the top-right header out of the thumb zone, and several key targets are under 44pt
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/QuarantineSheet.tsx`
  - Fix: Move next/finish into a bottom action row on WorkoutActive (it already has Voice + Add exercise down there), and apply minHeight: theme.touch.min to the listed sub-44pt Pressables.

**#117 ✅ [product-ux|M]** Dynamic Type will clip text: fixed-height controls everywhere and no maxFontSizeMultiplier strategy
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/VoiceMicButton.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/ExercisePicker.tsx`
  - Fix: Replace fixed height with minHeight + paddingVertical on the listed controls, and set a deliberate maxFontSizeMultiplier (e.g. 1.4-2.0) on dense chrome like the 10pt tracked micro-labels and the hero steppers where layout genuinely cannot flex.

**#119 ✅ [product-ux|S]** First run drops the user cold and empty Today's most prominent element is non-interactive, inverting 'one dominant action per screen'
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx`
  - Fix: Make the empty-state card itself the start action ('Start your first workout →' calling onBlankStart, styled like ResumeCard), and on Login make magic-link the primary button with password as the secondary path.

**#122 ✅ [release-ops|S]** UIBackgroundModes ['fetch'] is declared but nothing registers a background fetch task — App Review rejection risk
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: Delete the UIBackgroundModes entry from app.config.ts:26 and re-run `npx expo prebuild` so Info.plist regenerates without it. If background sync is a real future goal, add it back together with an actual expo-background-task registration and an ADR.

**#123 ✅ [release-ops|M]** Privacy manifest declares zero collected data while the app ships Sentry with user IDs and syncs identity-linked fitness data
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/ios/FlexYug/PrivacyInfo.xcprivacy, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/errorReporting.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts`
  - Fix: Author the manifest in config so it survives prebuild: add `ios.privacyManifests` in app.config.ts declaring Crash Data, Performance Data, Other Diagnostic Data (per Sentry's Apple privacy guidance), plus Fitness and User ID as collected-linked-to-identity, tracking=false. Fill the matching ASC privacy labels before first TestFlight external build, and note the mapping in docs/operations.md's release checklist.

**#124 ✅ [release-ops|M]** OTA stance is undecided drift: no expo-updates or runtimeVersion, yet all three build profiles declare EAS Update channels
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/eas.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/adr/`
  - Fix: Decide and write ADR 0005. Option A (recommended for a JS-heavy app with known bug history): add expo-updates, set runtimeVersion: { policy: 'appVersion' } in app.config.ts, keep the channels, document the `eas update` hotfix flow in operations.md. Option B: store-only updates — remove the three channel keys and record why.

**#125 ✅ [release-ops|S]** Android is paper-configured but never built or tested; release checklist instructs shipping it to Play anyway
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/operations.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/eas.json`
  - Fix: Make the stance explicit. Short term (recommended): declare iOS-only for v0.x — add one line to README/overview, strip `--platform all`/`android` steps from the operations.md release checklist, and drop the Android submit profile from eas.json so the docs describe reality. When Android becomes real, budget a proper pass: prebuild, voice/permission QA, adaptive icon + notification icon, Play data-safety form.

**#126 ✅ [release-ops|M]** No CI: the release gate is a human reading a checklist; nothing enforces typecheck/lint/jest before a store build
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/operations.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json`
  - Fix: Minimal pipeline, one file: .github/workflows/ci.yml — on PR/push: actions/setup-node with node-version-file: .nvmrc, `npm ci --legacy-peer-deps`, then typecheck + lint + format:check + jest as parallel-ish steps. Second job on tag `v*`: `eas build --profile production --platform ios --non-interactive --no-wait` using an EXPO_TOKEN secret. Update operations.md steps 1-3 to "CI must be green".

**#127 ✅ [release-ops|S]** No backup/DR story for the Supabase mirror — the 'durable' half of local-first has undefined durability
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/threat-model.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/operations.md`
  - Fix: Add a 'Data durability' section to docs/operations.md: record the Supabase plan and its backup window, enable PITR (or a scheduled pg_dump via GitHub Actions cron to object storage if staying on free tier), and write the 10-line restore runbook. Optionally add a user-facing local export (JSON/CSV) later as the true local-first escape hatch.

**#90 ✅ [security-privacy|S]** Sentry URL scrubbing targets the wrong breadcrumb categories; native-layer breadcrumbs bypass beforeBreadcrumb entirely
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/errorReporting.ts`
  - Fix: In beforeBreadcrumb, drop the category allowlist: scrub `data.url` / `data.to` / `data.from` on ANY breadcrumb whose data carries them. Additionally disable native network breadcrumbs (sentry-cocoa `enableNetworkBreadcrumbs` via the SDK's experimental options, or set `maxBreadcrumbs`/use `beforeSend` to strip `event.breadcrumbs` entries with URLs as a backstop, since beforeSend DOES see native breadcrumbs). Add a test that feeds an 'xhr' breadcrumb with a query string through the hook.

**#91 ✅ [security-privacy|S]** Threat model claims deep links land on a session-gated layout — false for every stack route outside (tabs)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/threat-model.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/(tabs)/_layout.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/workout/active.tsx`
  - Fix: Move the gate to one place: either an `app/(protected)/` route group containing tabs + workout + history + profile with the session check in its _layout, or a root-level guard in app/_layout.tsx's AppNavigator that redirects to /login when !loading && !session for any route except /login. Then update threat-model.md:43 to cite the actual file.

**#92 ✅ [security-privacy|S]** Password sign-in shipped while every document describes passwordless OTP+PKCE; no password policy configured anywhere
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/config.toml, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/ARCHITECTURE.md`
  - Fix: Decide deliberately: if passwordless is the product story, delete handlePasswordSignIn and the password field (also fixes GENERIC_AUTH_ERROR at Login.tsx:22 telling magic-link users to 'check your password'). If password auth stays, add `minimum_password_length = 12` + `password_requirements` to config.toml / dashboard, enable leaked-password protection, and add password credentials to the threat-model asset table.

**#93 ✅ [security-privacy|S]** No auth rate-limit, OTP expiry, or send-frequency configuration — magic-link abuse posture left at defaults *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/config.toml, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Login.tsx`
  - Fix: Codify limits in config.toml so they're reviewable and survive `config push`: `[auth.rate_limit] email_sent = 2` (per hour per address), `token_verifications = 30`, and `otp_expiry = 900` + `max_frequency = "1m"` under [auth.email]. Mirror in the hosted dashboard. Add a client-side resend cooldown (e.g. 60s) on the magic-link button.

**#4 ✅ [sync-correctness|S]** Pull's conflict-resolution snapshot is read outside the page transaction — a concurrent local edit gets visibly reverted
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/transaction.ts`
  - Fix: Move the fetchPendingOutbox call (or a per-row re-check of the outbox) inside the withTransaction callback so the pending-ops snapshot and the merge are atomic with respect to enqueueMutation. The bulk-fetch can stay for performance; just re-validate rows that the snapshot marked clean with one `SELECT row_id FROM outbox WHERE table_name = ? AND row_id IN (...)` inside the transaction.

**#5 ✅ [sync-correctness|M]** Push drains at most 50 rows per trigger, never loops, and nothing ever wakes up backed-off rows — backoff is theater
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/engine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/syncHelpers.ts`
  - Fix: (1) Loop in pushOutbox while a full batch was read AND at least one row succeeded. (2) After a pass that leaves rows in backoff, schedule one `setTimeout` for `MIN(next_attempt_at) - now` that calls triggerPush (clear it in stopSyncEngine/handleSignOut). (3) Add a 'rerun' dirty flag in triggerPush: if a trigger arrives while pushInFlight, run one more pass when the current one finishes. Delete the dead sleep block.

**#6 ✅ [sync-correctness|M]** Quarantine discard is non-cascading: orphaned local children, orphaned outbox ops, and a permanently stale row the cursor already passed
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/quarantine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/mutations.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts`
  - Fix: In discardQuarantinedRow's transaction: delete ALL outbox rows for the same (table_name, row_id); for insert/upsert discards, walk SOFT_DELETE_CASCADE to remove dependent local rows and their outbox entries; and reset the affected table's sync_meta cursor (or enqueue a targeted single-row re-fetch) so the server's authoritative state is re-pulled.

**#7 ❌ [sync-correctness|M]** reconcileLocalRowId failure poisons a push the server already accepted, and queued ops still reference the dead id *(verifier: low)*
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts`
  - Fix: Delete the outbox row BEFORE reconciling (the server write is done; reconcile failure should be its own retryable concern, not a push failure), make reconcile collision-safe (if the server-id row already exists locally, merge/delete the client-id row instead of UPDATE id), and inside the same transaction rewrite `outbox.row_id` and `payload_json.id` for pending ops referencing the old id.

**#8 ✅ [sync-correctness|S]** Pull cursor can permanently skip rows committed out of timestamp order — ADR-0004's monotonicity claim doesn't hold
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/adr/0004-server-owned-updated-at.md`
  - Fix: Rewind the cursor by a small overlap on every pull (e.g., `cursorTs = max(EPOCH, last_pulled_at - 5s)` with last_pulled_id reset to ZERO_UUID when rewinding) — the local merge is an idempotent upsert so re-processing a few rows is free. Update ADR-0004 to document the read-skew window and the chosen mitigation.

**#81 ✅ [testing-quality|M]** Push partial-failure semantics untested: skip-and-continue ordering, backoff gating, and the parent-fails/children-push hazard
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/push.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/__tests__/offline-workout.test.ts`
  - Fix: Three named tests in a new src/sync/__tests__/push.test.ts: (1) enqueue 3 rows, mock the server to fail only row 1 with a constraint error → assert rows 2-3 reach serverLog and row 1 has attempts=1 with future next_attempt_at; (2) seed a row with next_attempt_at one hour ahead plus an eligible row behind it → assert only the eligible row pushes without any manual UPDATE; (3) parent workout insert fails, child set push returns FK error → decide and pin the policy (either assert children also defer, or implement 'skip children whose parent row_id is still in the outbox' and assert that).

**#82 ✅ [testing-quality|S]** npm run lint is red (12 errors) — any quality gate built on it is dead on arrival
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/jest.setup.js, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/useCompleteSetAnimation.ts`
  - Fix: Add an eslint override for jest.setup.js and **/__tests__/** with env: { jest: true } (or globals from eslint-plugin-jest) — under an hour, takes errors to 0. Then burn down or explicitly disable the 24 auto-fixable warnings so lint output is signal. This is the prerequisite for the CI pipeline this repo lacks: a single workflow running `tsc --noEmit && eslint . --max-warnings 0 && jest` would complete in well under a minute given the 9.3s suite.

**#83 ✅ [testing-quality|S]** finishWorkout → PR detection seam is never tested, and its silent catch means regressions are invisible
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/__tests__/finishWorkout.test.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/__tests__/personalRecords.test.ts`
  - Fix: Add to finishWorkout.test.ts: seed an exercise + completed sets, call finishWorkout(wId, USER_ID), assert (1) personal_records rows exist for all three PR types and (2) outbox contains op='upsert' rows for table personal_records whose payload_json includes user_id/exercise_id/type — closing the loop to the reconciliation test. Also replace the bare catch with Sentry.captureException so production regressions surface; assert the capture in a test where recordWorkoutPRs is forced to throw.

**#84 ✅ [testing-quality|M]** Voice grammar tests only cover happy-path integers; decimal weights are unparseable and untested — kg users cannot voice-log 2.5 kg increments
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/numberWords.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/__tests__/grammar.setvalues.test.ts`
  - Fix: Add failing-first tests: parse('102.5 for 5') → {weight:102.5, reps:5}; parse('sixty two point five for five') → {weight:62.5}; parse('185 4 5') ambiguity → document expected behavior. Fix: in normalize(), preserve periods between digits (replace /(?<!\d)[.](?!\d)/ instead of all periods); teach firstNumberIn/wordsToNumber decimal digit tokens (/^\d+(\.\d+)?$/) and the 'point' connector. Pull adversarial transcripts from real expo-speech-recognition output during a QA session into a table-driven test.

**#85 ✅ [testing-quality|M]** useVoiceSession's confirm/undo/silence state machine is untested despite a purpose-built injectable engine seam
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/__tests__/numericStepper.test.ts`
  - Fix: Write renderHook tests with a fake engine that lets the test emit final transcripts: (1) emit '185' (low confidence) → ui.phase 'pending', emit 'yes' → set updated in SQLite and phase 'applied'; (2) emit '185 for 5' then 'undo' → values reverted, second 'undo' no-op; (3) fake timers: 15s silence → engine.stop called and phase 'idle'; (4) dispatch failure (activeSetId null) → assert current silent behavior, then decide whether it should surface an error label. The DB layer already runs in-process, so these are full-stack voice tests minus the microphone.

**#87 ✅ [testing-quality|L]** No render-level or e2e coverage; harness design makes component tests impossible — adopt Maestro for three named flows
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/jest.setup.js, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Do not bolt component rendering onto the current harness (a second jest-expo project buys little for a one-dominant-action UI). Instead add Maestro (fits local-first: no network stubbing needed, SQLite is the source of truth) with exactly three flows checked into .maestro/: (1) cold start → Today renders with start-workout CTA; (2) full session — start workout, add exercise via picker, step weight/reps, complete 2 sets, finish, assert workout appears in History; (3) the regression flow — sign out, sign back in (Supabase test account or OTP inbox stub), start a workout, assert no crash/no stale data. Run on iOS simulator locally and in the (to-be-created) CI on a macos runner, nightly rather than per-PR.

**#151 ✅ [time-and-timezone-semantics|S]** Day-of-week default title and the Phase-4 auto-title are dead code: the only createWorkout caller hardcodes title 'Workout', so the rename guard never matches
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/exercises.ts`
  - Fix: Either drop the explicit 'Workout' title in Today.tsx:144 so the dayOfWeek default applies, or extend the guard to treat 'Workout' as a default title too (e.g. `const isDefault = title === 'Workout' || NAMES.includes(title)`). Long-term, replace the string-equality heuristic with an explicit `title_is_auto` flag set at creation, immune to timezone drift.

**#152 ✅ [time-and-timezone-semantics|S]** No timezone test coverage: jest runs in the dev machine's TZ, and the format tests are deliberately noon-anchored 'to dodge DST/midnight edges' — exactly the edges that are broken
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/__tests__/format.test.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/__tests__/personalRecords.test.ts`
  - Fix: Pin `process.env.TZ = 'America/New_York'` in jest.setup.js (or run the suite twice with TZ=UTC and TZ=America/New_York via jest projects). Add boundary cases: a set completed at 01:00Z (8pm previous day local) must bucket/label to the local day; a workout finished yesterday 21:00 local viewed at 08:00 must say 'Yesterday' in both Today and History.

**#153 ✅ [time-and-timezone-semantics|M]** Plan day_of_week slots are stored and rendered but never resolved — 'Today can point you at the right workout' is unwired, and the day-boundary convention for it is undefined
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/TrainingPlan.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/plans.ts`
  - Fix: Implement the Today→plan resolver using local getDay() (matching dayOfWeek.ts and the greeting), advance cycle_cursor on finishWorkout, and write the convention down: add a short 'Time semantics' section to ARCHITECTURE.md stating that storage is UTC instants, all day-boundary semantics (plan slots, history groups, chart buckets, relative labels) are device-local calendar days. No doc currently pins this — grep for timezone/UTC across docs/ returns nothing normative.

**#26 ✅ [ui-craft|M]** Five divergent modal/sheet implementations, a dead exit animation, and an OS Alert in the core flow — no Sheet primitive
  - Files: `src/components/ExercisePicker.tsx, src/components/RestOverrideSheet.tsx, src/components/QuarantineSheet.tsx`
  - Fix: Build one <Sheet> primitive: backdrop fade (timing fast), panel spring-in (settle), deferred unmount on close (keep Modal mounted until the exit timing completes), handle, surface + radius.lg top corners, reduce-motion fallback. Port all five callers. Add <ConfirmSheet> for the skip-set confirm. This is the 'do components feel bespoke or default-RN' question — right now dismissals feel default-RN.

**#27 ✅ [ui-craft|S]** Multiple touch targets in the daily-use flows fall well below the 44pt non-negotiable
  - Files: `src/components/RestProgressBar.tsx, src/screens/Today.tsx, src/screens/WorkoutActive.tsx`
  - Fix: Audit with a minHeight: theme.touch.min pass: give RestProgressBar a 44pt pressable strip, bump Today's alt buttons and PlanSetup pills to minHeight 44, convert the header next/finish into a proper 44pt pill button, and space the stepper chevrons so slops don't overlap.

**#28 ❌ [ui-craft|S]** Reduce Motion is not honored by the two largest animations in the app, contradicting the design doc's claim *(verifier: low)*
  - Files: `src/components/ActiveSetCard.tsx, src/components/ExercisePicker.tsx`
  - Fix: Hoist reduce-motion into a context/hook read once (useReducedMotion from Reanimated works on the UI thread), and in ActiveSetCard: when reduced, set entryY to 0 and replace the fling with a fade; otherwise consider entering from ~80-120pt with the settle spring instead of full screen height. Same gate in the future Sheet primitive (finding 5).

**#29 ✅ [ui-craft|M]** Progress chart is the weakest screen for a product about progress: system-font ticks, arbitrary tick values, no PR markers, no interaction (ELEVATION #3)
  - Files: `src/ui/LineChart.tsx, src/screens/Progress.tsx`
  - Fix: Work-of-art treatment: GeistMono_500 tick labels; 'nice number' tick algorithm (multiples of 2.5/5/25 in the user's unit, with the unit on the top tick); small accent ring + 'PR' micro-label on record points; a header numeral showing current best with delta-vs-90-days; tap-and-hold scrub with a mono readout; 8/12-week segmented range. The chart is where a strength journal proves its worth — it currently reads as a placeholder.

**#30 ✅ [ui-craft|M]** Icon language is incoherent: a color emoji and ad-hoc text glyphs instead of the mandated SVG set; TabIcon ignores its focused prop
  - Files: `src/components/VoiceMicButton.tsx, src/components/NumericStepperView.tsx, src/components/ActiveSetCard.tsx`
  - Fix: Extend TabIcon into a tiny Icon registry (mic, check, chevron-up/down/right, arrow-right) at 1.8 stroke to match the tab set; use focused to bump strokeWidth to ~2.2 or fill the glyph; give the mic a subtle 1Hz opacity pulse while listening (gated on reduce motion). Keep the deliberate text-arrow idiom ('history →', '→ Resume') — that one reads as intentional typography; the emoji does not.

**#31 ✅ [ui-craft|S]** ExercisePicker dead-ends on no results — create-exercise exists but is reachable only by voice
  - Files: `src/components/ExercisePicker.tsx, src/queries/exercises.ts`
  - Fix: Add ListEmptyComponent: when query.trim() is non-empty, render a pressable row `+ Create "{query}"` calling createCustomExercise then onPick(id); when the query is empty and the library is empty, a one-line calm explainer. ~30 lines, closes a real capability gap and an empty-state hole.

**#135 ✅ [units-of-measure-semantics|M]** Weight is rendered with no unit suffix on every read surface; the only unit-aware formatter (formatWeight) is dead code
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/HistoryDetail.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/RepeatCard.tsx`
  - Fix: Thread units from useProfile into History/HistoryDetail/Progress/RepeatCard and route every weight render through formatWeight; give the Progress chart a yTickFormatter that appends the unit (or a single axis caption). Delete-or-use is the bar: a tested helper with no callers is worse than none.

**#103 ✅ [voice-engine|S]** `add (.+)` catch-all creates and syncs custom exercises from any utterance starting with "add", with no confirmation
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/dispatch.ts`
  - Fix: Route addExercise through the low-confidence pending-confirm path unless the name exactly (or fuzzily, above a threshold) matches an existing catalog entry. Make the undo also soft-delete the custom exercise it created when one was created. Prefer a ranked match (prefix > word-boundary > substring) over matches[0].

**#104 ✅ [voice-engine|S]** Every failure mode is silent: permission denial, engine errors, failed dispatches, and unhandled rejections give the user nothing
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/useVoiceSession.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/speechEngine.ts`
  - Fix: Surface each: on denied permission show an alert with a Linking.openSettings() action and render the button in a distinct 'permission needed' state; on engine error set a transient ui phase {phase:'error', label} with haptic; show res.message when ok=false; wrap handleCommand in try/catch routing to the same error state (and Sentry, consistent with the sync engine's safeListener pattern).

**#105 ✅ [voice-engine|S]** Parsed rest duration is dropped and there is no way to skip rest by voice — "skip rest" actually STARTS the timer
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts`
  - Fix: Extend useRestTimer.start to accept an optional seconds override (persisting it alongside startedAt), pass command.seconds through WorkoutActive's onStartRest, add a 'skip/stop/cancel rest' grammar rule mapped to timer.stop, and exclude negated phrasings (skip|no|stop|cancel before 'rest') from the startRest rule. Add an audit test asserting every parsed Command field is consumed by the screen wiring — that pattern has now broken twice (unit, seconds).

**#15 ✅ [workout-state|S]** Infinite setState loop when every set in the workout is completed: findInitialCursor's fallback returns a completed set that the reposition effect immediately rejects
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/activeSet.ts`
  - Fix: Two-line fix: in the reposition branch, bail out if the recomputed cursor deep-equals the current one; and make the no-incomplete-sets case resolve to null (recap view) instead of a completed set — that matches the screen's own 'cursor null → finish summary' semantics. Add a regression test with an all-completed ExerciseShape fixture.

**#16 ✅ [workout-state|S]** onComplete has no double-fire guard (swipe + voice 'done' race) and incomplete sets render as completed ✓ ghosts
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/activeSet.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/ActiveSetCard.tsx`
  - Fix: Add an in-flight ref guard at the top of onComplete (set before the first await, clear in finally), and either filter ghosts by s.completed or render incomplete ghosts with a neutral marker instead of ✓. Wrap the complete+stage pair so a stage failure surfaces a toast rather than silently corrupting the cursor.

**#17 ✅ [workout-state|M]** Rest-timer notification chain breaks on remount: leaving the screen cancels the scheduled notification but restore never reschedules it, and restore ignores the persisted target
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/useRestTimer.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/hooks/restTimerPolicy.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: Persist the notification id alongside startedAt/targetSeconds in PersistedTimer; on restore, honor persisted.targetSeconds, and reschedule a notification for the REMAINING seconds if none is pending (or stop cancelling on unmount and instead cancel only on stop/finish/sign-out). Set firedRef=true on restore when elapsed >= target to suppress the phantom haptic.

**#18 ✅ [workout-state|S]** An exercise-less active workout cannot be finished or discarded — user is stuck with 'Workout in progress' forever
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx`
  - Fix: Add a 'Discard workout' action to the zero-exercise empty state (and arguably to the recap screen for zero-completed-set sessions), wired to deleteWorkoutLocal + workouts.all invalidation + router.replace('/today'). The cascade soft-delete in db/mutations.ts:34-38 already handles children safely.

**#19 ✅ [workout-state|S]** Keypad input is unvalidated: negative, huge, and fractional values flow straight into SQLite and sync; clampValue exists but is dead code
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/numericStepper.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/NumericStepperView.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Run committed keypad values through clampValue (min 0, sane maxes, e.g. 1500 weight / 200 reps) and Math.round reps to integers before calling onChange; reject NaN/negatives in parseUserInput. One place — the commit() in useDebouncedCommit — covers both blur and debounce paths.

**#20 ✅ [workout-state|M]** repeatLastWorkout clones the workout across N+1 separate transactions — a crash mid-clone leaves a partial (possibly empty) active workout
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/repeatLastWorkout.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/mutations.ts`
  - Fix: Wrap the whole clone (workout + all workout_exercises + seed sets + their outbox rows) in one withTransaction, writing rows directly like addExerciseToWorkout does, so the clone is all-or-nothing. Replace the seed loop with a single JOIN using a window function or GROUP BY.


### LOW

**#44 ⚪ [architecture|S]** Dead and duplicated helpers: unused core/format exports while screens re-implement them; vestigial sleep stub in push.ts
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/core/format.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/SessionRecap.tsx`
  - Fix: Delete getGreeting/formatWeight or point Today.tsx at them; rename SessionRecap's helper (formatElapsed) to break the false twin; either implement the intended push retry follow-up or remove the sleep stub and its test seam. Consolidate relative-time formatting into core/format.

**#45 ⚪ [architecture|S]** safeRoute() blanket-defeats typed routes for six statically-known paths
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/safeRoute.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts`
  - Fix: Regenerate route types (expo start / typecheck) and remove safeRoute from the static paths — they should typecheck as written. Keep the cast only if the dynamic /history/[id] genuinely defeats inference, and say so in the helper's doc comment with the expo-router version that fixes it.

**#74 ⚪ [consistency-drift|S]** Two conflicting exported `Theme` types and three storage-key naming conventions
  - Files: `src/ui/theme.ts, src/ui/useTheme.ts, src/ui/SkinContext.tsx`
  - Fix: Rename the legacy export to LegacyTheme (or delete with the shim per the earlier finding). Standardize on the '@flexyug/<key>/v1' convention and migrate the skin key through kvStore (read old key once for migration).

**#75 ⚪ [consistency-drift|S]** Error-toast wiring drifts across screens: sync-aware filter applied on one screen, raw toasts on the other two
  - Files: `src/ui/ToastContext.tsx, src/screens/Today.tsx, src/screens/Profile.tsx`
  - Fix: Export a single useErrorToast from ToastContext (sync-aware by default) and use it in all three screens, deleting the per-screen lambdas. If Today/Profile genuinely should toast sync errors, say so in a comment where the raw variant is chosen.

**#76 ⚪ [consistency-drift|S]** Small idiom drift: nowIso() vs inline toISOString (including a shadowing local), and the app's lone Alert.alert
  - Files: `src/sync/push.ts, src/queries/exercises.ts, src/screens/WorkoutActive.tsx`
  - Fix: Import nowIso in push/pull/engine/exercises and delete the shadowing local (rename to `cutoffIso` if a distinct point-in-time is intended). Replace the skip-set Alert with the ConfirmDialog primitive when the shared sheet base from the sheets finding lands, or restyle it as an inline confirm on the card.

**#63 ⚪ [data-schema|S]** Local schema is not the '1:1 mirror' it claims: dead foreign_keys pragma, missing CHECKs, and 00010's PR index optimizes the wrong database
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/client.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00010_perf_indexes.sql`
  - Fix: Fix the comment to state what is actually mirrored (columns yes; FKs/CHECKs no — enforced app-side and server-side respectively). Either remove the foreign_keys pragma or add the REFERENCES clauses. Adopt a rule for perf indexes: client-query indexes go in schema.ts, sync-cursor indexes go in migrations; add the achieved_at index locally (trivial, table is tiny, but it keeps the rule honest). Consider a jest parity test that diffs column lists between LOCAL_SCHEMA_SQL and a parsed migration snapshot to catch future drift mechanically.

**#64 ⚪ [data-schema|S]** Outbox lacks a (table_name, row_id) index for pull's conflict-protection lookups
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/schema.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts`
  - Fix: Add `CREATE INDEX IF NOT EXISTS idx_outbox_table_row ON outbox(table_name, row_id);` to LOCAL_SCHEMA_SQL — CREATE INDEX IF NOT EXISTS applies to existing installs on next boot, no migration step needed.

**#164 ⚪ [notifications-permission-and-response-lifecycle|S]** categoryIdentifier 'rest-timer' references a category that is never registered — dead config, and a missed slot for Skip/+30s actions
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/lib/restNotifications.ts`
  - Fix: Either register the category at startup with useful actions ('Skip rest', '+30s') handled by the response listener proposed above — a natural fit for one-handed lock-screen use — or delete the constant and the categoryIdentifier field. Keeping the identifier is only worthwhile if the response-listener finding is implemented, since the category string is also the cleanest filter key for cancel-all sweeps.

**#54 ⚪ [performance|S]** Per-row stylesheet creation in list items and unvirtualized, stagger-animated PR list
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/History.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Progress.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/ui/FadeInView.tsx`
  - Fix: Hoist makeStyles to module scope (compute once per skin×scheme). Convert the Progress PR list to FlatList, cap the entrance stagger (e.g. first 8 rows), and read reduce-motion once at module/provider level instead of per-FadeInView mount.

**#55 ⚪ [performance|S]** Exercise search is an unindexable LOWER(name) LIKE '%q%' scan re-run per debounced keystroke, with each query string cached separately
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/exercises.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/ExercisePicker.tsx`
  - Fix: Low priority until catalog growth: add a `name_norm` column (lowercased) with an index and use prefix match `name_norm LIKE 'q%'` (index-friendly) falling back to contains for the recall tail, or adopt SQLite FTS5 on exercises.name. Keep the existing debounce.

**#146 ⚪ [pr-lifecycle-and-derived-data-invalidation|S]** finishWorkout's bare catch swallows all PR-recording failures with no telemetry
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/workouts.ts`
  - Fix: Replace the bare catch with `catch (err) { Sentry.captureException(err, { tags: { seam: 'pr-detection' } }); }`. One line, preserves the best-effort contract, makes the historically-untested seam observable.

**#147 ⚪ [pr-lifecycle-and-derived-data-invalidation|S]** Quarantine discard of a personal_records insert hard-deletes the row, setting up a re-insert/re-fail loop
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/quarantine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Derived rows shouldn't participate in user-facing quarantine at all: either exclude personal_records from the quarantine UI and auto-discard its failures (the data regenerates from sets), or — per finding #3 — stop syncing the table and the case disappears. If it stays, discard should also suppress regeneration for that (exercise, type) until the value changes, which is more machinery than the table deserves.

**#148 ⚪ [pr-lifecycle-and-derived-data-invalidation|S]** getHeaviestWeightHistory omits the workout_exercises.deleted_at filter that its sibling query applies
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/personalRecords.ts`
  - Fix: Add `AND we.deleted_at IS NULL` to getHeaviestWeightHistory. Better: extract the shared 'visible completed sets for exercise' FROM/WHERE fragment into one constant both queries use, so the visibility rule cannot drift again.

**#129 ⚪ [release-ops|S]** Node version is unpinned across the three environments that build the app (.nvmrc 20, dev machine on 24, EAS image default)
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/.nvmrc, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/eas.json, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/package.json`
  - Fix: Pick one Node LTS (e.g. 22), set it in .nvmrc, add "node": "22.x.y" to a shared eas.json build profile (top-level `build.base` with extends, or per-profile), and use node-version-file: .nvmrc in the future CI workflow so all three agree.

**#130 ⚪ [release-ops|M]** Launch/icon assets ignore the light/dark system: dark-only splash for light-mode users, no iOS 18 dark/tinted icon variants, placeholder notification icon
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app.config.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/assets, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/operations.md`
  - Fix: Use the object forms: ios.icon { light, dark, tinted } and an expo-splash-screen `dark` block (light splash on a light background for light mode). Generate the variants from assets/icon-source.svg. Move the notification-icon TODO into the operations.md release checklist so it can't be skipped.

**#94 ⚪ [security-privacy|S]** Magic-link exchange failures are silently swallowed; the comment claiming AuthProvider surfaces them is false
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/app/_layout.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/auth/AuthContext.tsx`
  - Fix: Surface the exchange error: route to /login with a param (`router.replace('/login?linkError=1')`) or add an error field to AuthContext that Login renders ('That link expired — send a new one'). Fix or delete the misleading catch comment.

**#9 ⚪ [sync-correctness|M]** Hot-path writes bypass enqueueMutation with three hand-rolled copies of the insert+outbox pattern
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/sets.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/exercises.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/mutations.ts`
  - Fix: Extend enqueueMutation with an optional in-transaction callback (e.g., `prepare: (tx) => Promise<payload>`) so order_index can be computed inside the primitive's transaction, then delete the two bespoke copies. This is the cheap insurance against the next sync fix not reaching the hot path.

**#10 ⚪ [sync-correctness|S]** Sync docs diverge from the implementation in ways the next AI sprint will trust
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/docs/local-first-sync.md, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/ARCHITECTURE.md`
  - Fix: Fix the four spots: replace the withTransactionAsync snippet with the real withTransaction signature, correct the insert→upsert row in the op table, sync the SyncState interface, and document the single-pass batch semantics (or fix the loop per the push-drain finding and keep the doc). For a repo explicitly maintained by rotating AI sessions, doc-as-spec accuracy is a correctness control, not polish.

**#86 ⚪ [testing-quality|S]** expo-sqlite mock permits nested withTransactionAsync that production would reject — comment is factually wrong
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/__mocks__/expo-sqlite.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/transaction.ts`
  - Fix: Either delete withTransactionAsync from the mock (so accidental use fails loudly in tests) or make it match production: throw if txDepth > 0. Fix the header comment. Add one test asserting the mock rejects nested transactions, pinning the fidelity contract.

**#154 ⚪ [time-and-timezone-semantics|S]** Pull writes PostgREST '+00:00'-format timestamps verbatim into a database that otherwise uses 'Z'-suffixed ISO — lexicographic ORDER BY on mixed formats is a latent mis-ordering footgun
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/sync/pull.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/db/uuid.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/plans.ts`
  - Fix: Normalize in pull.ts normalize(): for the known timestamp columns (or any string matching /T.*[+-]\d\d:\d\d$/), rewrite via `new Date(v).toISOString()` so the local DB holds exactly one format. One-line change plus a test asserting a pulled '+00:00' row round-trips to 'Z' form.

**#155 ⚪ [time-and-timezone-semantics|S]** Workout 'day' attribution is inconsistent: History groups by started_at, the Repeat card counts from ended_at, RECENT rows from started_at
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/History.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/Today.tsx, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/queries/history.ts`
  - Fix: Declare started_at the canonical 'workout day' (matches lifter intuition: an 11pm session belongs to the day you walked in), switch Today.tsx:117/220 to started_at, and have the chart attribute sets to their workout's started_at day rather than per-set completed_at if single-day-per-session is the desired semantic.

**#156 ⚪ [time-and-timezone-semantics|S]** WorkoutActive title-input fallback shows the CURRENT day name, not the workout's start day
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Use `dayOfWeek(activeQuery.data?.started_at ?? new Date())` for the fallback, or drop the fallback entirely since title cannot be null.

**#32 ⚪ [ui-craft|S]** Hero screens bypass spacing tokens and mix 16/20pt gutters in the same column
  - Files: `src/screens/Today.tsx, src/components/ActiveSetCard.tsx, src/components/SessionVolumeBar.tsx`
  - Fix: Pick one gutter (space.page = 20) for both text and cards on Today/WorkoutActive, swap literals for theme.space tokens, and either add radius.xl(18) to the scale or drop the card to radius.lg. An hour of work that makes the flagship screens feel machined instead of assembled.

**#33 ⚪ [ui-craft|M]** Brand mark underdelivers in-app: Login rebuilds the lockup by hand, the skin-adaptive metal finishes are dead, and the 212-node medal won't read at 40-60px
  - Files: `src/ui/Logo.tsx, src/ui/Medal.tsx, src/screens/Login.tsx`
  - Fix: 1) Cut a simplified small-size medal variant (rim + cartouche + F, no ticks/guilloché) and switch on size < ~96. 2) Wire metal-per-skin (forge→gunmetal etc.) or consciously decide fixed-rose and delete the dead METALS map. 3) Make Login use <Logo> and give the wordmark Geist SemiBold. 4) Update design-system.md §Logo to describe the medal, not the F-bar.

**#136 ⚪ [units-of-measure-semantics|S]** NumericStepper hides the unit label except when focused in hero size — the primary logging surface shows a bare number
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/NumericStepperView.tsx`
  - Fix: Always render the unit beside the hero weight value (dim it when unfocused if visual calm matters); keep REPS hidden if desired by special-casing, but the weight unit should be unconditionally visible.

**#137 ⚪ [units-of-measure-semantics|M]** No bounds validation on weight anywhere — keypad and sync accept any finite number, and a typo becomes an uncorrectable PR
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/numericStepper.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/supabase/migrations/00002_constraints_and_improvements.sql`
  - Fix: Clamp keypad commits to a sane range (e.g. 0–1000 in canonical kg) via the existing clampValue, add a matching CHECK constraint server-side, and make PR recompute authoritative (recompute from scratch and allow downward correction) so input mistakes are recoverable.

**#106 ⚪ [voice-engine|S]** Recognition locale hardcoded to en-US; availability check doesn't verify on-device support that start() requires
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/speechEngine.ts`
  - Fix: Resolve the lang from the device locale when it's an English variant (e.g. via expo-localization, falling back to en-US), and use the library's supportsOnDeviceRecognition/locale-support query in isAvailable() so the button's disabled state is truthful. Keep the grammar en-only for now — that's a reasonable product scoping — but the recognition locale should not be.

**#107 ⚪ [voice-engine|S]** Engine confidence and parser context are plumbed but ignored — dead inputs masking the one signal that could gate destructive commands
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/speechEngine.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/grammar.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/voice/commands.ts`
  - Fix: Either use these signals or delete them. Concretely: when engine confidence is present and below a threshold (~0.4), downgrade any parsed command to the pending-confirm path; use hasActiveExercise to reject/pend data commands; or strip both fields so the next reader isn't misled about what the system actually does.

**#21 ⚪ [workout-state|M]** The 'state machine' has drifted out of its tested pure module: advanceCursor is dead code while real transition logic lives untested in screen callbacks
  - Files: `/Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/components/activeSet.ts, /Users/naren/Documents/Work/MokshLabs/Projects/vyayamy/src/screens/WorkoutActive.tsx`
  - Fix: Re-centralize: extend activeSet.ts with the real transitions (completeAndStage, nextExercise, prevExercise, reconcile(cursor, exercises) returning {cursor, setsToStage}) as pure functions over ExerciseShape, port the screen callbacks to thin wrappers, delete advanceCursor, and move the bug scenarios above into unit tests of the pure module.
