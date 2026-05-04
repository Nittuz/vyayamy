# Operations

Day-to-day commands for building, testing, and shipping the Vyayamy app.

## Local Development

### Prerequisites

- Node 20+
- Xcode (for iOS simulator + native builds) and/or Android Studio
- An Expo account (free) for EAS
- A Supabase project

### Install

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` keeps Expo's locked `react@18.2` compatible with a few transitive packages advertising React 19 peers.

### Run

```bash
npm run start       # Metro bundler
npm run ios         # + boot iOS simulator
npm run android     # + boot Android emulator
```

**Expo Go vs. development build.** Expo Go ships its own Expo runtime and does not include our native modules (`expo-sqlite`, `expo-notifications`, Sentry). For anything beyond cosmetic UI work, build a development client:

```bash
npx expo run:ios     # local native build (simulator or device)
npx expo run:android
# or, once EAS is wired:
npx eas build --profile development --platform ios
```

Install the resulting app on your device and use `npx expo start --dev-client` to attach Metro.

### Typecheck and tests

```bash
npm run typecheck    # tsc --noEmit
npm test             # Jest (ts-jest + better-sqlite3 mock)
npm run test:watch
npm run lint
npm run format
```

Run typecheck + tests after substantive changes. The integration test [src/__tests__/offline-workout.test.ts](../src/__tests__/offline-workout.test.ts) is the canary for sync correctness.

## Environment Variables

Copy `.env.example` to `.env` and fill as needed. All variables prefixed with `EXPO_PUBLIC_` are embedded in the JS bundle; treat them as public.

| Variable                            | Required? | Purpose                                           |
| ----------------------------------- | --------- | ------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`          | Yes       | Supabase project URL                              |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`     | Yes       | Supabase anon key (safe for client use with RLS)  |
| `EXPO_PUBLIC_SENTRY_DSN`            | No        | Enables Sentry crash reporting when set           |
| `SENTRY_ORG`                        | Prod      | Source-map upload on EAS production builds        |
| `SENTRY_PROJECT`                    | Prod      | "                                                 |
| `SENTRY_AUTH_TOKEN`                 | Prod      | "                                                 |
| `EAS_PROJECT_ID`                    | EAS       | Links the app to the EAS project                  |
| `APPLE_ID`                          | Submit    | Apple ID for EAS Submit → TestFlight              |
| `ASC_APP_ID`                        | Submit    | App Store Connect app id                          |
| `APPLE_TEAM_ID`                     | Submit    | Apple developer team id                           |

The `production` build profile in [eas.json](../eas.json) forwards Sentry and Supabase vars from the EAS environment at build time.

## Supabase

### Migration ordering

Run in order against your Supabase database:

1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_constraints_and_improvements.sql`
3. `supabase/migrations/00003_training_plans.sql`
4. `supabase/migrations/00004_sync_support.sql` — **required**; the sync engine depends on `updated_at`, `deleted_at`, triggers, and indexes

Optionally run `supabase/seed.sql` for the global exercise library.

### Adding a migration

- File name: next sequential number + underscore + descriptive snake_case (e.g. `00005_add_workout_notes.sql`)
- Make it idempotent: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
- Add RLS policies for every new table, scoped to `auth.uid()`
- For any synced table: add `updated_at`, `deleted_at`, the `set_updated_at` trigger, and the `idx_<table>_updated_at` index — see `00004_sync_support.sql` for the template
- Mirror the schema in [src/db/schema.ts](../src/db/schema.ts) and add the name to `SYNCED_TABLES`
- Update [src/db/types.ts](../src/db/types.ts) with Row / Insert / Update types

### Running Supabase locally

```bash
npx supabase start
```

Uses `supabase/config.toml` (API on 54321, DB on 54322, Studio on 54323). Auth emails land in [Inbucket](http://localhost:54324). Point `.env` at `http://localhost:54321` to develop against the local instance.

## EAS Build

[eas.json](../eas.json) defines three profiles:

| Profile       | Distribution | Purpose                                                      |
| ------------- | ------------ | ------------------------------------------------------------ |
| `development` | Internal     | Dev client with `developmentClient: true`                    |
| `preview`     | Internal     | QR-installable preview; iOS simulator build enabled          |
| `production`  | Store        | TestFlight / Play Store; auto-increment version; Sentry wired |

```bash
# One-time setup
npx eas init

# Dev client
npx eas build --profile development --platform ios
npx eas build --profile development --platform android

# Preview build (QR installable)
npx eas build --profile preview --platform all

# Production
npx eas build --profile production --platform all
```

Each profile forwards env vars via the `env` block in `eas.json`; make sure they are defined in your EAS project's secrets (`npx eas secret:create`) before triggering a build.

## EAS Submit

```bash
# iOS → TestFlight
npx eas submit --profile production --platform ios

# Android → internal track
npx eas submit --profile production --platform android
```

iOS pulls `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` from env. Android expects `./android-service-account.json` next to `eas.json` — generate it in Google Cloud Console (Play service account with API access) and DO NOT commit it.

## Sentry

[src/lib/errorReporting.ts](../src/lib/errorReporting.ts) is a thin wrapper around `@sentry/react-native`:

- `initErrorReporting()` runs at module load in [app/_layout.tsx](../app/_layout.tsx). It returns early if `EXPO_PUBLIC_SENTRY_DSN` is not set — local dev runs without any crash reporting.
- The root [src/ui/ErrorBoundary.tsx](../src/ui/ErrorBoundary.tsx) calls `captureException(err, { boundary: 'root' })` for render-time errors.
- `setUser()` is called on `onAuthStateChange` so reports carry identity.

Source maps upload automatically on EAS production builds via the `@sentry/react-native/expo` config plugin when `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` are provided.

## Notifications

`expo-notifications` is used for the background rest-timer cue. The runtime requests permission lazily on the first rest-timer start (see [src/lib/restNotifications.ts](../src/lib/restNotifications.ts)); if the user denies, the app continues to work with the foreground timer only.

The notification icon used on Android is configured via the `expo-notifications` plugin in [app.config.ts](../app.config.ts) (`./assets/notification-icon.png`). Replace that asset before shipping.

## Test matrix

| Suite                                                          | What it guards                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| [src/core/__tests__/pr-detection.test.ts](../src/core/__tests__/pr-detection.test.ts) | Pure PR computation                                       |
| [src/__tests__/offline-workout.test.ts](../src/__tests__/offline-workout.test.ts) | Local-first write path, outbox drain on reconnect         |

`expo-sqlite` is mocked via [src/db/__mocks__/expo-sqlite.ts](../src/db/__mocks__/expo-sqlite.ts), which swaps in an in-memory `better-sqlite3` backend. `expo-crypto` is mocked in [src/db/__mocks__/expo-crypto.ts](../src/db/__mocks__/expo-crypto.ts) so UUIDs work in Node.

Jest config lives under the `"jest"` key in [package.json](../package.json):

- `preset: ts-jest`
- `testEnvironment: node`
- `moduleNameMapper` maps `@/*` and the two `__mocks__` above
- `testPathIgnorePatterns` excludes [legacy-web/](../legacy-web/)

## Release checklist

Before pushing a build to TestFlight or Play Internal:

1. `npm run typecheck`
2. `npm test`
3. `npm run lint`
4. Bump `version` in [app.config.ts](../app.config.ts) and tag the git commit
5. `npx eas build --profile production --platform all`
6. `npx eas submit --profile production --platform ios`
7. `npx eas submit --profile production --platform android`
8. Smoke-test the new build on a real device (log a workout offline, toggle airplane mode, verify sync on reconnect)
9. Announce the build in your beta channel with release notes
