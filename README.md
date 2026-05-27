# FlexYug

> **Product name:** FlexYug. **Repo / directory name:** `vyayamy`. The repo predates the product rename; references to `vyayamy` you'll still see (the clone target, this directory) are the repo handle, not the product.

A mobile-only, local-first strength-training journal. Built around one job: **capture strength training reliably, offline, and fast**. SQLite on the device is the source of truth during a session; Supabase is a durable mirror that syncs in the background.

## Features

- **Offline-first capture** — every set, rest, and finish is written to SQLite synchronously; the network is a background concern
- **Workout logging** — start a session from Today, add exercises, record sets (weight + reps), and finish
- **Training plans** — weekly or rotating-cycle schedules of templates; view and edit under Profile → Plan
- **Repeat workouts** — re-create a past workout with the same exercise lineup
- **Personal records** — automatic PR detection for heaviest weight, best volume, and most reps at a given weight
- **Progress charts** — per-exercise trend lines drawn with `react-native-svg`
- **Workout history** — past sessions grouped by date with period filters
- **Custom exercises** — add your own movements alongside the seeded library
- **Unit preference** — switch between kg and lb
- **Magic-link auth** — passwordless email sign-in via Supabase Auth + deep links
- **Background rest timer** — local notification fires even when the app is backgrounded or locked

## Tech Stack

| Layer              | Technology                                           |
| ------------------ | ---------------------------------------------------- |
| Runtime            | Expo SDK 55, React Native 0.83, React 19             |
| Language           | TypeScript 5 (strict)                                |
| Navigation         | Expo Router (file-based, typed routes)               |
| Local DB           | `expo-sqlite` (SQLite on device, source of truth)    |
| Cloud DB / Auth    | Supabase (Postgres + GoTrue + PostgREST, sync target) |
| Server state       | TanStack React Query 5 (reads SQLite, not HTTP)      |
| Sync engine        | In-house outbox + incremental pull ([src/sync/](src/sync/)) |
| Styling            | `StyleSheet.create` + tokens in [src/ui/theme.ts](src/ui/theme.ts) |
| Charts             | Custom SVG via `react-native-svg` ([src/ui/LineChart.tsx](src/ui/LineChart.tsx)) |
| Haptics / timers   | `expo-haptics`, `expo-notifications`                 |
| Error reporting    | `@sentry/react-native` (gated by DSN)                |
| Testing            | Jest + `ts-jest`, `better-sqlite3` in-memory mock    |
| Build / distribution | EAS Build + EAS Submit                             |

There is no custom API server. The mobile client talks to Supabase directly through PostgREST for sync, and every UI write goes through the local outbox.

## Project Structure

```
vyayamy/
├── app/                            # Expo Router routes (file-based)
│   ├── _layout.tsx                 # Root stack + providers + db init + sync engine
│   ├── login.tsx                   # Magic-link sign-in
│   ├── +not-found.tsx
│   ├── (tabs)/                     # Bottom tab group
│   │   ├── _layout.tsx
│   │   ├── today.tsx
│   │   ├── history.tsx
│   │   ├── progress.tsx
│   │   └── profile.tsx
│   ├── history/[id].tsx            # Workout detail
│   ├── profile/plan/index.tsx      # Training plan view
│   ├── profile/plan/setup.tsx      # Plan setup wizard
│   └── workout/active.tsx          # Active workout session
├── src/
│   ├── auth/                       # Supabase client + AuthProvider + useAuth
│   ├── components/                 # ExerciseBlock, ExercisePicker, SetsTable
│   ├── core/                       # Pure domain logic (PR detection, format, sync helpers)
│   ├── db/                         # SQLite: schema, client, mutations, uuid, types, mocks
│   ├── lib/                        # Cross-cutting services (errorReporting, restNotifications)
│   ├── queries/                    # React Query hooks reading SQLite
│   ├── screens/                    # Large screen components consumed by app/ routes
│   ├── sync/                       # engine.ts, push.ts, pull.ts, state.ts
│   ├── ui/                         # theme.ts + shared native UI (ErrorBoundary, LineChart, SyncIndicator, ...)
│   └── __tests__/                  # Integration tests (offline workout)
├── supabase/
│   ├── migrations/                 # Numbered SQL migrations (00001 … 00009)
│   │   ├── 00001_initial_schema.sql
│   │   ├── 00002_constraints_and_improvements.sql
│   │   ├── 00003_training_plans.sql
│   │   ├── 00004_sync_support.sql           # Adds updated_at, deleted_at, triggers, indexes
│   │   ├── 00005_seed_beyond_strength_phase1.sql
│   │   ├── 00006_plan_presets.sql           # Plan-preset catalog tables (4)
│   │   ├── 00007_seed_global_exercises.sql
│   │   ├── 00008_seed_plan_presets.sql
│   │   └── 00009_security_hardening.sql     # WITH CHECK, server-owned updated_at, search_path
│   ├── config.toml                 # Local Supabase + auth settings
│   ├── templates/                  # GoTrue email templates
│   └── seed.sql                    # Bootstrapping data
├── docs/                           # Architecture + operational docs
├── app.config.ts                   # Expo app config (plugins, extra, scheme)
├── eas.json                        # EAS Build + Submit profiles
├── .env.example                    # Required env vars
└── ARCHITECTURE.md                 # Design and solution architecture
```

## Navigation

| Route                         | Screen                                                       | Purpose                        |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `/(tabs)/today`               | [src/screens/Today.tsx](src/screens/Today.tsx)               | Dashboard, start workout       |
| `/(tabs)/history`             | [src/screens/History.tsx](src/screens/History.tsx)           | Past workouts list             |
| `/(tabs)/progress`            | [src/screens/Progress.tsx](src/screens/Progress.tsx)         | PRs, trend charts, frequency   |
| `/(tabs)/profile`             | [src/screens/Profile.tsx](src/screens/Profile.tsx)           | Settings, routines, sign out   |
| `/workout/active`             | [src/screens/WorkoutActive.tsx](src/screens/WorkoutActive.tsx) | Live workout session         |
| `/history/[id]`               | [src/screens/HistoryDetail.tsx](src/screens/HistoryDetail.tsx) | Single workout detail        |
| `/profile/plan`               | [src/screens/TrainingPlan.tsx](src/screens/TrainingPlan.tsx) | View active plan               |
| `/profile/plan/setup`         | [src/screens/PlanSetup.tsx](src/screens/PlanSetup.tsx)       | Create or edit plan            |
| `/login`                      | [src/screens/Login.tsx](src/screens/Login.tsx)               | Magic-link sign-in             |

Bottom nav: Today, History, Progress, Profile.

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Xcode** (for iOS simulator and native builds) and/or **Android Studio** (for Android emulator)
- An **Expo account** (required for EAS Build; optional for local dev)
- A **Supabase** project ([supabase.com](https://supabase.com), free tier works)
- Optional: the **Supabase CLI** for local database development

### 1. Clone and install

```bash
git clone <repo-url> vyayamy
cd vyayamy
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag silences a few transitive dependencies whose declared React peer ranges haven't caught up to React 19 yet. Once they do, drop the flag.

### 2. Configure Supabase

In the Supabase SQL editor (or via the Supabase CLI) run the migrations **in order**:

1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_constraints_and_improvements.sql`
3. `supabase/migrations/00003_training_plans.sql`
4. `supabase/migrations/00004_sync_support.sql` — **required**; adds `updated_at`, `deleted_at`, triggers, and indexes that the sync engine depends on
5. `supabase/migrations/00005_seed_beyond_strength_phase1.sql` — seed program for the Beyond Strength preset
6. `supabase/migrations/00006_plan_presets.sql` — read-only catalog tables for the Plan Setup wizard
7. `supabase/migrations/00007_seed_global_exercises.sql` — seeds the global exercise library
8. `supabase/migrations/00008_seed_plan_presets.sql` — seeds the preset catalog
9. `supabase/migrations/00009_security_hardening.sql` — **required**; adds `WITH CHECK` to RLS policies, server-owned `updated_at` trigger, locks down `handle_new_user`, FK on `personal_records.set_id`

In **Project Settings → API**, copy the project URL and anon key.

### 3. Environment variables

```bash
cp .env.example .env
```

Fill in at minimum:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Additional variables (all optional in development):

| Variable                      | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `EXPO_PUBLIC_SENTRY_DSN`      | Enables Sentry crash reporting when set        |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry source-map upload on EAS production |
| `EAS_PROJECT_ID`              | Links the app to your EAS project              |
| `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` | EAS Submit → TestFlight                  |

### 4. Run locally

```bash
npx expo start
```

Press `i` for iOS simulator or `a` for Android emulator. On a physical device, install Expo Go (for simple previews) or a **development build** (required once native modules like `expo-sqlite`, `expo-notifications`, or Sentry are active):

```bash
npx expo run:ios
# or
npx expo run:android
```

## Scripts

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `npm run start`        | Start the Expo dev server (`expo start`)              |
| `npm run ios`          | Start Expo and boot the iOS simulator                 |
| `npm run android`      | Start Expo and boot the Android emulator              |
| `npm run prebuild`     | Generate native `ios/` and `android/` projects        |
| `npm run lint`         | Run ESLint                                            |
| `npm run format`       | Format with Prettier                                  |
| `npm run format:check` | Check formatting without writing                      |
| `npm run typecheck`    | `tsc --noEmit`                                        |
| `npm test`             | Run Jest once                                         |
| `npm run test:watch`   | Run Jest in watch mode                                |

## EAS Build and Submit

[eas.json](eas.json) defines three profiles:

| Profile       | Purpose                                                 |
| ------------- | ------------------------------------------------------- |
| `development` | Dev client with `developmentClient: true`               |
| `preview`     | Internal distribution; iOS simulator build enabled      |
| `production`  | Store builds, auto-incremented, Sentry env wired        |

Typical flow:

```bash
# One-time: create an EAS project and set EAS_PROJECT_ID in .env
npx eas init

# Dev client on a physical device
npx eas build --profile development --platform ios

# Preview (QR-installable)
npx eas build --profile preview --platform all

# Production
npx eas build --profile production --platform all
npx eas submit --profile production --platform ios      # → TestFlight
npx eas submit --profile production --platform android  # → internal track
```

Submit credentials are read from env vars (`APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID`) and, on Android, from a service-account JSON referenced in `eas.json`.

## Testing

Tests run under Node with `ts-jest`. `expo-sqlite` is swapped for an in-memory `better-sqlite3` backend via `moduleNameMapper` in [package.json](package.json), which lets the sync engine and mutation primitive be exercised without an emulator.

| File                                                  | What it covers                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| [src/__tests__/offline-workout.test.ts](src/__tests__/offline-workout.test.ts) | End-to-end offline write → outbox → push on reconnect    |
| [src/__tests__/pull.test.ts](src/__tests__/pull.test.ts) | Incremental pull — column-merge with pending outbox, cursor advance, tombstones |
| [src/__tests__/sync-state.test.ts](src/__tests__/sync-state.test.ts) | `deriveSyncState` enum reduction                              |
| [src/core/__tests__/pr-detection.test.ts](src/core/__tests__/pr-detection.test.ts) | Pure PR computation and comparison logic              |

Run `npm test` to execute every suite.

## Local Supabase (optional)

```bash
npx supabase start
```

Uses the settings in `supabase/config.toml` (API on 54321, DB on 54322, Studio on 54323). Update `.env` to point at the local instance. Local Supabase captures auth emails in [Inbucket](http://localhost:54324).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design. Key entry points:

- **Local-first sync**: [docs/local-first-sync.md](docs/local-first-sync.md)
- **Product overview and domain glossary**: [docs/overview.md](docs/overview.md)
- **Design system**: [docs/design-system.md](docs/design-system.md)
- **Build and operations**: [docs/operations.md](docs/operations.md)
- **Architecture decisions**: [docs/adr/](docs/adr/)
- **Feature specs**: [docs/specs/](docs/specs/)
- **Agent guardrails**: [AGENTS.md](AGENTS.md) and [.cursor/rules/](.cursor/rules/)
