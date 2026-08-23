# FlexYug

A mobile-only, local-first strength-training journal built around one job: capture strength training reliably, offline, and fast. SQLite on the device is the source of truth; Supabase is a durable mirror that syncs in the background.

> The product is **FlexYug**; the repo and directory are named `vyayamy`, a handle that predates the product rename.

## Features

- **Offline-first capture**: every write goes through `enqueueMutation` ([src/db/mutations.ts](src/db/mutations.ts)), which applies it to SQLite and appends an outbox row in one transaction. The network is a background concern.
- **Workout logging**: start a session from Today, add exercises, record sets, and finish ([src/screens/WorkoutActive.tsx](src/screens/WorkoutActive.tsx)).
- **Hands-free voice logging**: run a whole session by voice with on-device speech recognition and a local grammar; works in airplane mode. See [Voice logging](#voice-logging).
- **Per-set units**: each set stores the unit it was logged in (`sets.units`, [supabase/migrations/00011_set_units.sql](supabase/migrations/00011_set_units.sql)). Single-set displays use the set's own unit; aggregations (volume, PRs, charts) convert through one conversion home, [src/core/units.ts](src/core/units.ts) (`convertWeight`, `sumVolume`). Changing your preference never reinterprets history.
- **Personal records**: automatic PR detection in pure domain code ([src/core/pr-detection.ts](src/core/pr-detection.ts)), maintained as a local derived cache ([src/queries/personalRecords.ts](src/queries/personalRecords.ts)).
- **Training plans**: weekly or rotating-cycle schedules of templates, with a preset catalog, under Profile ([app/profile/plan/](app/profile/plan/)).
- **Repeat workouts**: re-create a past workout's exercise lineup ([src/queries/repeatLastWorkout.ts](src/queries/repeatLastWorkout.ts)).
- **Progress charts**: per-exercise trend lines drawn with `react-native-svg` ([src/ui/LineChart.tsx](src/ui/LineChart.tsx)).
- **Workout history**: past sessions with per-workout detail ([src/screens/History.tsx](src/screens/History.tsx), [src/screens/HistoryDetail.tsx](src/screens/HistoryDetail.tsx)).
- **Custom exercises**: add your own movements alongside the seeded library ([src/components/ExercisePicker.tsx](src/components/ExercisePicker.tsx)).
- **One Blacktop identity**: true-mono dark + chalk light palettes following the system scheme ([src/ui/colors.ts](src/ui/colors.ts), [src/ui/useTheme.ts](src/ui/useTheme.ts)); no theme picker.
- **Complete-set choreography**: banking a set fires a haptic, a live session-volume tally, and an accent glow ([src/ui/completeSetChoreography.ts](src/ui/completeSetChoreography.ts), [src/components/SessionVolumeBar.tsx](src/components/SessionVolumeBar.tsx)); a calm recap on finish ([src/ui/SessionRecap.tsx](src/ui/SessionRecap.tsx)).
- **Auth**: magic-link or password sign-in via Supabase Auth ([src/screens/Login.tsx](src/screens/Login.tsx), [src/auth/authActions.ts](src/auth/authActions.ts)), behind a single root-level auth gate in [app/\_layout.tsx](app/_layout.tsx).
- **Background rest timer**: a local notification fires even when the app is backgrounded; tapping it returns to the active workout ([src/lib/restNotifications.ts](src/lib/restNotifications.ts)).
- **Sync you can see**: status indicator, error stripe, diagnostics sheet, and a quarantine flow for writes that exhaust retries ([src/sync/quarantine.ts](src/sync/quarantine.ts), [src/components/QuarantineSheet.tsx](src/components/QuarantineSheet.tsx)).

### Navigation

| Route                 | Screen                                                         | Purpose                      |
| --------------------- | -------------------------------------------------------------- | ---------------------------- |
| `/(tabs)/today`       | [src/screens/Today.tsx](src/screens/Today.tsx)                 | Dashboard, start workout     |
| `/(tabs)/progress`    | [src/screens/Progress.tsx](src/screens/Progress.tsx)           | PRs, trend charts            |
| `/(tabs)/profile`     | [src/screens/Profile.tsx](src/screens/Profile.tsx)             | Settings, plan, sign out     |
| `/workout/active`     | [src/screens/WorkoutActive.tsx](src/screens/WorkoutActive.tsx) | Live workout session         |
| `/history`            | [src/screens/History.tsx](src/screens/History.tsx)             | Past workouts list           |
| `/history/[id]`       | [src/screens/HistoryDetail.tsx](src/screens/HistoryDetail.tsx) | Single workout detail        |
| `/profile/plan`       | [src/screens/TrainingPlan.tsx](src/screens/TrainingPlan.tsx)   | View active plan             |
| `/profile/plan/setup` | [src/screens/PlanSetup.tsx](src/screens/PlanSetup.tsx)         | Create or edit plan          |
| `/login`              | [src/screens/Login.tsx](src/screens/Login.tsx)                 | Magic-link or password login |

Bottom nav: Today, Progress, Profile. History opens from the Today header, not a tab.

### Voice logging

On the active workout screen, a mic button opens a hands-free listening session (long-press for push-to-talk). Speech is transcribed on-device (`expo-speech-recognition`) and parsed by a local grammar ([src/voice/grammar.ts](src/voice/grammar.ts)), so no network is needed. Commands map onto the same local-first mutations the buttons use ([src/voice/dispatch.ts](src/voice/dispatch.ts)), so offline behavior, sync, and undo are identical to tapping. Clear commands apply instantly; ambiguous ones (a bare number, a new exercise name) ask you to confirm first. Unrecognized chatter is ignored. The parser sits behind the `VoiceParser` interface ([src/voice/commands.ts](src/voice/commands.ts)) so a smarter parser can drop in later without touching the engine or UI.

Every row below is verified against [src/voice/grammar.ts](src/voice/grammar.ts):

| You say                                                                     | Result                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| "185 for 5", "one eighty-five for five", "185 by 5", "log 135 times 8 reps" | Log weight and reps on the active set                                            |
| "225 for 5 done"                                                            | Logs 225 x 5 (values win over the trailing keyword); a separate "done" completes |
| "five reps at one thirty five"                                              | Reps-first phrasing, logs reps and weight                                        |
| "100 kilos for 5"                                                           | Explicit unit, stored on the set                                                 |
| "185"                                                                       | Weight only; low confidence, asks you to confirm                                 |
| "5 reps"                                                                    | Reps only                                                                        |
| "done", "got it", "complete"                                                | Complete the active set                                                          |
| "add a set", "one more"                                                     | Stage another set                                                                |
| "add bench press"                                                           | Add an exercise; always confirms before creating from a misheard name            |
| "next exercise", "previous exercise"                                        | Move between exercises                                                           |
| "start rest timer", "two minute rest"                                       | Start the rest timer, with optional duration                                     |
| "skip rest", "stop the rest timer", "rest done"                             | Stop a running rest timer                                                        |
| "make it 195"                                                               | Correct the staged weight (confirmed)                                            |
| "scratch that", "undo"                                                      | Undo the last command                                                            |
| "yes"                                                                       | Confirm a pending low-confidence command                                         |
| "finish workout"                                                            | Open the finish confirmation                                                     |
| "stop"                                                                      | End the listening session                                                        |

Voice needs a development build (the recognizer is a native module; it does not run in Expo Go):

```bash
npx expo prebuild
npx expo run:ios
```

> **After any icon/splash/branding change, run `npm run prebuild:clean` once.**
> `expo run:ios` reuses an existing `ios/` directory as-is, and a plain
> `expo prebuild` does not overwrite its xcassets — so native branding (app
> icon, launch splash) silently stays stale until a `--clean` prebuild
> regenerates `ios/` from `app.config.ts`. (`scripts/build-ipa.sh` already
> does this.) A clean prebuild wipes Xcode-side signing selection;
> `build-ipa.sh` re-applies the team from `.env`, and simulator builds need
> no signing.

## Implementation status

A 16-dimension deep review ran in June 2026 (115 confirmed findings), followed by roughly 33 test-first fix commits merged to main. The narrative synthesis, phase plan, and full findings appendix live in git history as `docs/specs/2026-06-10-deep-review-improvement-plan.md`. The per-area assessment from that review (pre-redesign snapshot) lives in git history as `docs/archive/REPO_REVIEW.md`; the visual and interaction backlog is in [docs/UX_POLISH_BACKLOG.md](docs/UX_POLISH_BACKLOG.md).

**Partial**:

- **Rest-alert status in Profile**: the capability check exists (`getRestAlertStatus` in [src/lib/restNotifications.ts](src/lib/restNotifications.ts)) but the Profile "Rest alerts" status row is not wired to it.
- **PR moment in the set choreography**: the choreography defines a PR pill state ([src/ui/completeSetChoreography.ts](src/ui/completeSetChoreography.ts)), but live PR detection does not drive it mid-session yet, and the session recap has no PR card.
- **Text primitive migration**: [src/ui/Text.tsx](src/ui/Text.tsx) is the standard and screens were swept onto Geist, but raw React Native `Text` usages remain in screens.

**Planned / known open**:

- **Plan-to-Today loop**: plans are created and viewable, but the day's scheduled workout does not yet feed the Today start flow.
- **VoiceOver and Dynamic Type passes**: need on-device QA.
- **iOS privacy manifest**: needs an EAS build and store-side verification.

## Tech stack

Versions from [package.json](package.json) on main.

| Layer                | Technology                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime              | Expo SDK 56, React Native 0.85.3, React 19.2.3                                                                                                         |
| Language             | TypeScript 5.9, strict                                                                                                                                 |
| Navigation           | Expo Router ~56.2 (file-based, typed routes enabled in [app.config.ts](app.config.ts))                                                                 |
| Local DB             | `expo-sqlite` (source of truth, schema in [src/db/schema.ts](src/db/schema.ts))                                                                        |
| Cloud DB / auth      | Supabase (`@supabase/supabase-js` 2.x), reached only by [src/sync/](src/sync/) and [src/auth/](src/auth/)                                              |
| Server state         | TanStack React Query 5 (reads SQLite, not HTTP)                                                                                                        |
| Sync engine          | In-house outbox plus incremental pull ([src/sync/](src/sync/))                                                                                         |
| Styling              | `useTheme()` + `makeStyles`, tokens in [src/ui/colors.ts](src/ui/colors.ts) and [src/ui/typography.ts](src/ui/typography.ts); Geist / Geist Mono fonts |
| Charts               | Custom SVG via `react-native-svg` ([src/ui/LineChart.tsx](src/ui/LineChart.tsx))                                                                       |
| Haptics / timers     | `expo-haptics`, `expo-notifications`                                                                                                                   |
| Voice                | `expo-speech-recognition` (on-device STT) + local grammar parser ([src/voice/](src/voice/))                                                            |
| Error reporting      | `@sentry/react-native` 7.x, gated by `EXPO_PUBLIC_SENTRY_DSN`                                                                                          |
| Testing              | Jest 29 + `ts-jest`, `better-sqlite3` in-memory swap for `expo-sqlite`                                                                                 |
| CI                   | GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): typecheck, lint, test on every push to main and every PR                        |
| Build / distribution | EAS Build + EAS Submit ([eas.json](eas.json))                                                                                                          |

There is no custom API server. The client talks to Supabase directly through PostgREST, and only from the sync and auth layers.

## Local-first architecture

The full picture is in [docs/local-first-sync.md](docs/local-first-sync.md) (a fuller pre-redesign snapshot, `docs/archive/ARCHITECTURE_REALITY.md`, lives in git history). The short version:

- **Reads**: React Query hooks in [src/queries/](src/queries/) read SQLite. The UI never blocks on the network.
- **Writes**: `enqueueMutation` ([src/db/mutations.ts](src/db/mutations.ts)) applies the write to SQLite, appends an outbox row, and cascades soft-deletes to FK children, all in a single transaction.
- **Mutation event bus**: committed writes emit on [src/db/mutationEvents.ts](src/db/mutationEvents.ts) (`emitMutationCommitted`); the sync engine ([src/sync/engine.ts](src/sync/engine.ts)) subscribes and debounces a push. The queries layer does not import the sync engine.
- **Push**: [src/sync/push.ts](src/sync/push.ts) drains the outbox in insertion order, never sends a row while an earlier write to the same row is pending, and verifies the server actually matched a row on update and delete (`assertServerRowMatched`), so a 0-row PostgREST update cannot silently drop a write. Rows that exhaust retries are quarantined for explicit user retry or discard ([src/sync/quarantine.ts](src/sync/quarantine.ts)).
- **Pull**: [src/sync/pull.ts](src/sync/pull.ts) does incremental per-table cursor pulls, merging around pending outbox writes, with per-table fault isolation so one bad table cannot poison the rest.
- **personal_records is local-only**: it is a derived cache recomputed from sets (which do sync) and is intentionally excluded from `SYNCED_TABLES` ([src/db/schema.ts](src/db/schema.ts)). Two devices converge because they derive from the same synced sets.

## Development setup

Prerequisites: Node 20 ([.nvmrc](.nvmrc)), Xcode and/or Android Studio, a Supabase project, and an Expo account for EAS builds.

```bash
git clone <repo-url> vyayamy
cd vyayamy
npm ci --legacy-peer-deps     # same install CI uses; the Expo 56 / RN 0.85 peer graph is not strict-clean
```

Run the migrations in [supabase/migrations/](supabase/migrations/) in order (Supabase SQL editor or CLI):

1. `00001_initial_schema.sql`
2. `00002_constraints_and_improvements.sql`
3. `00003_training_plans.sql`
4. `00004_sync_support.sql` (required by the sync engine: `updated_at`, `deleted_at`, triggers, indexes)
5. `00005_seed_beyond_strength_phase1.sql`
6. `00006_plan_presets.sql`
7. `00007_seed_global_exercises.sql`
8. `00008_seed_plan_presets.sql`
9. `00009_security_hardening.sql` (required: RLS `WITH CHECK`, server-owned `updated_at`)
10. `00010_perf_indexes.sql`
11. `00011_set_units.sql` (required: per-set `units` column plus backfill from the profile preference)

Then configure the environment and start:

```bash
cp .env.example .env    # fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start          # press i / a for simulator
npx expo run:ios        # development build, required for voice and other native modules
```

Optional local Supabase: `npx supabase start` uses [supabase/config.toml](supabase/config.toml) (API 54321, DB 54322, Studio 54323).

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run start`     | Expo dev server                           |
| `npm run ios`       | Build and run natively (iOS)              |
| `npm run typecheck` | `tsc --noEmit`                            |
| `npm run lint`      | ESLint                                    |
| `npm test`          | Jest once (`npm run test:watch` to watch) |
| `npm run format`    | Prettier write (`format:check` to check)  |

### Project structure

```
vyayamy/
├── app/                  # Expo Router routes
│   ├── _layout.tsx       # Root stack, providers, db init, sync engine, auth gate
│   ├── index.tsx         # Entry redirect
│   ├── login.tsx
│   ├── (tabs)/           # today.tsx, progress.tsx, profile.tsx
│   ├── history/          # index.tsx, [id].tsx
│   ├── profile/plan/     # index.tsx, setup.tsx
│   └── workout/active.tsx
├── src/
│   ├── auth/             # Supabase client, AuthProvider, authActions facade
│   ├── components/       # ActiveSetCard, ExercisePicker, sync/rest sheets, VoiceMicButton
│   ├── core/             # Pure domain: pr-detection, units, format, syncHelpers
│   ├── db/               # schema, client, mutations, mutationEvents, transaction
│   ├── lib/              # restNotifications, errorReporting, kvStore, safeRoute
│   ├── queries/          # React Query hooks reading SQLite, one file per domain
│   ├── screens/          # Screen components consumed by app/ routes
│   ├── sync/             # engine, push, pull, state, quarantine, outboxPreview
│   ├── ui/               # theme tokens, useTheme, Text primitive, LineChart, choreography
│   ├── voice/            # numberWords, grammar, dispatch (pure); speechEngine, useVoiceSession (native)
│   └── __tests__/        # Cross-layer integration tests
├── supabase/             # migrations/ (00001..00011), config.toml, seed.sql, templates/
├── docs/                 # Architecture, operations, specs, ADRs
├── app.config.ts
└── eas.json
```

## Testing

```bash
npm test
```

Current count on main: **70 suites, 673 tests**, all green; CI runs the same suite plus typecheck, lint, and Prettier on every PR.

Tests run in Node under `ts-jest`. The `moduleNameMapper` in [package.json](package.json) swaps `expo-sqlite` for an in-memory `better-sqlite3` backend ([src/db/**mocks**/expo-sqlite.ts](src/db/__mocks__/expo-sqlite.ts)), so the mutation primitive and the whole sync engine run against a real SQL engine without an emulator. Coverage spans the sync engine (push ordering, pull merge, quarantine), `enqueueMutation` and cascades, the query layer, pure domain logic (PR detection, unit conversion), the voice parser and dispatch, and UI choreography helpers.

What still needs a device or simulator: the voice native engine ([src/voice/speechEngine.ts](src/voice/speechEngine.ts), [src/voice/useVoiceSession.ts](src/voice/useVoiceSession.ts)), rest-notification timing, theme and motion visual checks, and the accessibility passes (VoiceOver, Dynamic Type). The voice on-device checklist is in the archived voice spec (`docs/specs/archive/2026-05-31-voice-workout-logging.md` in git history).

## Build and distribution

[eas.json](eas.json) sets `appVersionSource: "remote"` (EAS owns the build number) and defines two build profiles (the `development` dev-client profile was removed — `expo-dev-client` isn't installed; use `npx expo run:ios` for local native builds):

| Profile      | Purpose                                             |
| ------------ | --------------------------------------------------- |
| `preview`    | Internal distribution, iOS simulator builds enabled |
| `production` | Store builds, `autoIncrement`                       |

Shipping to a tester's iPhone without the paid Apple program (sideload path) and the TestFlight runbook both live in [docs/TESTING.md](docs/TESTING.md).

Build profiles carry no inline `env` blocks: runtime configuration lives in EAS environment variables created with `npx eas env:create` (the exact commands are in [docs/operations.md](docs/operations.md)). The submit profile is iOS-only and reads `APPLE_ID`, `ASC_APP_ID`, and `APPLE_TEAM_ID` from the environment; there is no Android submit profile.

```bash
npx eas build --profile preview --platform ios
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
```

A full EAS build has not been exercised in the latest verification pass (it needs project credentials); `eas.json` itself was repaired and hand-verified.

## Known limitations

- The Apple privacy manifest has not been verified against a store build.
- The pull path assumes the server schema matches local expectations; schema skew between devices on different app versions is not defended yet, and local SQLite migration handling is minimal.
- The sync collision sheet is a blocking modal.
- The outbox does not coalesce rapid edits to the same row (a known race with in-flight pushes makes naive coalescing lossy); a debounce mitigates the symptom.
- iOS-first: Android builds, but there is no Android submit profile and no Android QA pass.
- The voice grammar is English-only.
- Screen-level test coverage is thin compared to the data and sync layers.

## Contributing

Read [AGENTS.md](AGENTS.md) first: it defines the stack guardrails (what may not be introduced or removed), the layering rules enforced by lint, and the golden paths for adding mutations, queries, and screens. Non-trivial features start with a spec in [docs/specs/](docs/specs/); ADRs in [docs/adr/](docs/adr/) are read-only.

Every PR must pass the CI gate ([.github/workflows/ci.yml](.github/workflows/ci.yml)): typecheck, lint, and the full Jest suite. The working expectation is test-first: reproduce the bug or specify the behavior in a failing test, then make it pass. Changes to native or visual surfaces also need the relevant on-device checklist.
