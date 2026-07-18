# AGENTS

Guidance for AI coding agents and automated tools working in this repo.

## What FlexYug is

> The product is **FlexYug**. The repo / working directory is named `vyayamy` (predates the rename); treat occurrences of `vyayamy` you encounter as the repo handle, not the product.

A mobile-only, local-first strength-training journal built with Expo and React Native. SQLite on the device is the source of truth during a session. Supabase is a durable mirror reached only by the sync engine in [src/sync/](src/sync/). The UI must never block on the network.

## Specs and ADRs

Before implementing a non-trivial feature, check [docs/specs/](docs/specs/) for an existing design spec. If none exists for the work, draft one (or invoke the brainstorming flow) rather than improvising in code. Specs capture the _what_ and _how_ of a feature before implementation; they are mutable until the feature ships, then frozen.

[docs/adr/](docs/adr/) holds architectural decision records: the _why_ behind long-lived choices like local-first SQLite, the outbox sync model, and server-owned `updated_at`. **ADRs are read-only for agents.** Propose changes to a human; never write ADRs autonomously, never edit accepted ADRs. To change a decision, the human writes a new ADR that supersedes the old one.

## Stack guardrails

Do **not** introduce, remove, or migrate away from any of these without explicit approval:

- **Expo SDK 56**, **React Native 0.85**, **React 19.2**, **TypeScript** strict
- **Expo Router** for navigation (file-based under [app/](app/))
- **`expo-sqlite`** as the local source of truth; schema mirrored in [src/db/schema.ts](src/db/schema.ts)
- **Supabase** (Postgres + GoTrue + PostgREST) as the sync target only. The client ([src/auth/supabase.ts](src/auth/supabase.ts)) may be imported ONLY from [src/sync/](src/sync/) and [src/auth/](src/auth/); everything else uses the auth facade [src/auth/authActions.ts](src/auth/authActions.ts) or the queries layer. This is enforced by `no-restricted-imports`.
- **TanStack React Query 5** for all server state (reads SQLite, not HTTP)
- **`useTheme()` + `makeStyles(theme)`** for styling, with tokens in [src/ui/colors.ts](src/ui/colors.ts) / [src/ui/typography.ts](src/ui/typography.ts), exposed via [src/ui/useTheme.ts](src/ui/useTheme.ts). Text uses the [src/ui/Text.tsx](src/ui/Text.tsx) primitive. (`src/ui/theme.ts` is a deprecated static shim kept for the pre-hydration boot overlay and the `brand` name/tagline constant used by Login; do NOT use it in new code.)
- **`react-native-svg`** for charts ([src/ui/LineChart.tsx](src/ui/LineChart.tsx))
- **`expo-haptics`** and **`expo-notifications`** for haptic + timer feedback
- **`@sentry/react-native`** for error reporting (gated by `EXPO_PUBLIC_SENTRY_DSN`)
- **Jest + `ts-jest`** with `better-sqlite3` mocking `expo-sqlite`

Explicitly forbidden:

- React Router, React DOM, any web-specific API (`window`, `document`, `navigator.onLine`, `localStorage`)
- Recharts, `victory-native` (use the in-house `react-native-svg` chart in [src/ui/LineChart.tsx](src/ui/LineChart.tsx) instead)
- CSS files, CSS-in-JS (styled-components, emotion), Tailwind, utility frameworks
- Vite, Vitest, `jest-expo` (we use `ts-jest`)
- Redux, Zustand, Jotai, MobX, or any other global state store (UI state uses `useState`/`useReducer`, server state lives in React Query)
- ORMs, API wrapper servers, Edge Functions (PR detection stays client-side)
- Barrel files (`index.ts` re-exports): import from the source module directly

## Key directories

| Path                                         | Purpose                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [app/](app/)                                 | Expo Router routes; files here become screens                                                                      |
| [src/screens/](src/screens/)                 | Large screen components consumed by [app/](app/) route files                                                       |
| [src/components/](src/components/)           | Shared presentational components (no data fetching)                                                                |
| [src/ui/](src/ui/)                           | Theme, primitives, charts, error boundary, sync indicator                                                          |
| [src/queries/](src/queries/)                 | React Query hooks reading SQLite, one file per domain                                                              |
| [src/db/](src/db/)                           | SQLite schema, client, `enqueueMutation`, UUID helpers, types                                                      |
| [src/sync/](src/sync/)                       | `engine.ts`, `push.ts`, `pull.ts`, `state.ts`, `quarantine.ts`, ... (the only place that talks to Supabase tables) |
| [src/auth/](src/auth/)                       | Supabase client singleton, `AuthProvider`, `useAuth`                                                               |
| [src/core/](src/core/)                       | Pure domain logic (PR detection, formatting, sync helpers)                                                         |
| [src/lib/](src/lib/)                         | Cross-cutting services (`errorReporting.ts`, `restNotifications.ts`)                                               |
| [supabase/migrations/](supabase/migrations/) | Numbered SQL migrations                                                                                            |

## Golden paths

### Add a new mutation

1. Go through `enqueueMutation` in [src/db/mutations.ts](src/db/mutations.ts); never call `supabase.from(...).insert/update/delete()` from a query hook or component (the `@/auth/supabase` import is lint-restricted to src/sync + src/auth)
2. The mutation applies the change to SQLite and writes to `outbox` in one transaction
3. Add a `useMutation` wrapper in the appropriate file under [src/queries/](src/queries/) that invalidates affected query keys on success
4. The sync engine drains the outbox automatically

### Add a new screen

1. Create a route file under [app/](app/), e.g. `app/foo/index.tsx`
2. Put the actual screen under [src/screens/](src/screens/) and re-export it as the default export from the route file
3. All routes are protected by the single root-level auth gate in [app/\_layout.tsx](app/_layout.tsx) (#91); new routes are covered automatically. Do not add per-route guards or re-check auth inside screens.

### Add a new synced table

1. Write the Postgres migration. Required pieces:
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `deleted_at TIMESTAMPTZ` columns
   - `BEFORE INSERT OR UPDATE` trigger using `public.touch_updated_at()` (see [supabase/migrations/00009_security_hardening.sql](supabase/migrations/00009_security_hardening.sql)) so the client's clock is never trusted
   - `idx_<table>_updated_at` index for the pull cursor
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and a policy with **both** `USING` and `WITH CHECK` (the `USING`-only `FOR ALL` shape is exploitable; see 00009)
2. Add the same table to [src/db/schema.ts](src/db/schema.ts) (SQLite mirror), add its name to `SYNCED_TABLES`, and bump `SCHEMA_VERSION` in [src/db/client.ts](src/db/client.ts) if you need a new ALTER step
3. Update [src/db/types.ts](src/db/types.ts) with Row / Insert / Update typings
4. Add the table's React Query root prefix to `syncInvalidationRoots` in [src/queries/keys.ts](src/queries/keys.ts); without this, screens won't refresh after sync touches the new table
5. If the new table is a parent of any other synced table, add the relationship to `SOFT_DELETE_CASCADE` in [src/db/mutations.ts](src/db/mutations.ts) so soft-deletes propagate locally + into the outbox in one transaction
6. Derived data that is fully recomputable from synced rows should NOT be synced. Keep it as a local cache and recompute it (à la `personal_records`, which is recomputed from `sets`; see [src/queries/personalRecords.ts](src/queries/personalRecords.ts)). Only sync source-of-truth rows.

### Add a new query hook

1. Create or extend a file in [src/queries/](src/queries/) (one file per domain: `activeWorkouts.ts`, `sets.ts`, `history.ts`, `workoutDetail.ts`, `exercises.ts`, `plans.ts`, `planPresets.ts`, `personalRecords.ts`, `profile.ts`, ...)
2. Read via `getDb()` from [src/db/client.ts](src/db/client.ts); always filter `deleted_at IS NULL`
3. Use `enabled: !!userId` so queries don't fire before auth is ready
4. Keep the query key shape consistent with [src/queries/keys.ts](src/queries/keys.ts)

### Add styling

1. Call `const theme = useTheme()` ([src/ui/useTheme.ts](src/ui/useTheme.ts)) and build styles with a `makeStyles(theme)` factory memoized on `[theme]` (`useTheme` returns a stable reference per scheme, so the memo actually caches)
2. Render text through the [`<Text variant>`](src/ui/Text.tsx) primitive so the Geist family is always applied; don't hand-set `fontFamily` per `<Text>`
3. Never hard-code colors, spacing, or font sizes. Use tokens (`theme.color.ink`, `theme.color.inkSecondary`, `theme.space.s4`, `theme.depth.rule`, `theme.font.size.body`, ...). Corners are sharp by design — no `borderRadius` except `theme.radius.full` for circles. The palette uses `ink`/`inkSecondary`, not the old `text`/`textSecondary`.
4. Ensure interactive elements meet `theme.touch.min` (44pt)

## Testing and typecheck

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (ts-jest + better-sqlite3 mock)
npm run lint
```

After substantive edits run the first two at minimum. The integration test [src/**tests**/offline-workout.test.ts](src/__tests__/offline-workout.test.ts) exercises the full offline-write → outbox → push-on-reconnect path; keep it green.

## Pointers

- Full architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Product overview and domain glossary: [docs/overview.md](docs/overview.md)
- Local-first sync deep dive: [docs/local-first-sync.md](docs/local-first-sync.md)
- Design system: [docs/design-system.md](docs/design-system.md)
- Build and operations: [docs/operations.md](docs/operations.md)
- Cursor-specific rules (narrower, per-glob): [.cursor/rules/](.cursor/rules/)
