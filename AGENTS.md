# AGENTS

Guidance for AI coding agents and automated tools working in this repo.

## What FlexYug is

> The product is **FlexYug**. The repo / working directory is named `vyayamy` (predates the rename); treat occurrences of `vyayamy` you encounter as the repo handle, not the product.

A mobile-only, local-first strength-training journal built with Expo and React Native. SQLite on the device is the source of truth during a session. Supabase is a durable mirror reached only by the sync engine in [src/sync/](src/sync/). The UI must never block on the network.

## Stack guardrails

Do **not** introduce, remove, or migrate away from any of these without explicit approval:

- **Expo SDK 51**, **React Native 0.74**, **React 18**, **TypeScript** strict
- **Expo Router** for navigation (file-based under [app/](app/))
- **`expo-sqlite`** as the local source of truth; schema mirrored in [src/db/schema.ts](src/db/schema.ts)
- **Supabase** (Postgres + GoTrue + PostgREST) as the sync target only — reached from [src/sync/](src/sync/) and from auth code in [src/auth/](src/auth/), nowhere else
- **TanStack React Query 5** for all server state (reads SQLite, not HTTP)
- **`StyleSheet.create`** + tokens in [src/ui/theme.ts](src/ui/theme.ts) for styling
- **`react-native-svg`** for charts ([src/ui/LineChart.tsx](src/ui/LineChart.tsx))
- **`expo-haptics`** and **`expo-notifications`** for haptic + timer feedback
- **`@sentry/react-native`** for error reporting (gated by `EXPO_PUBLIC_SENTRY_DSN`)
- **Jest + `ts-jest`** with `better-sqlite3` mocking `expo-sqlite`

Explicitly forbidden:

- React Router, React DOM, any web-specific API (`window`, `document`, `navigator.onLine`, `localStorage`)
- Recharts, `victory-native` (conflicts with Expo 51's React 18)
- CSS files, CSS-in-JS (styled-components, emotion), Tailwind, utility frameworks
- Vite, Vitest, `jest-expo` (we use `ts-jest`)
- Redux, Zustand, Jotai, MobX, or any other global state store — UI state uses `useState`/`useReducer`, server state lives in React Query
- ORMs, API wrapper servers, Edge Functions (PR detection stays client-side)
- Barrel files (`index.ts` re-exports) — import from the source module directly

## Key directories

| Path                                           | Purpose                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| [app/](app/)                                   | Expo Router routes; files here become screens                           |
| [src/screens/](src/screens/)                   | Large screen components consumed by [app/](app/) route files            |
| [src/components/](src/components/)             | Shared presentational components (no data fetching)                     |
| [src/ui/](src/ui/)                             | Theme, primitives, charts, error boundary, sync indicator               |
| [src/queries/](src/queries/)                   | React Query hooks reading SQLite, one file per domain                   |
| [src/db/](src/db/)                             | SQLite schema, client, `enqueueMutation`, UUID helpers, types           |
| [src/sync/](src/sync/)                         | `engine.ts`, `push.ts`, `pull.ts`, `state.ts` — the only place that talks to Supabase tables |
| [src/auth/](src/auth/)                         | Supabase client singleton, `AuthProvider`, `useAuth`                    |
| [src/core/](src/core/)                         | Pure domain logic (PR detection, formatting, sync helpers)              |
| [src/lib/](src/lib/)                           | Cross-cutting services (`errorReporting.ts`, `restNotifications.ts`)    |
| [supabase/migrations/](supabase/migrations/)   | Numbered SQL migrations                                                 |

## Golden paths

### Add a new mutation

1. Go through `enqueueMutation` in [src/db/mutations.ts](src/db/mutations.ts) — never call `supabase.from(...).insert/update/delete()` from a query hook or component
2. The mutation applies the change to SQLite and writes to `outbox` in one transaction
3. Add a `useMutation` wrapper in the appropriate file under [src/queries/](src/queries/) that invalidates affected query keys on success
4. The sync engine drains the outbox automatically

### Add a new screen

1. Create a route file under [app/](app/) — e.g. `app/foo/index.tsx`
2. Put the actual screen under [src/screens/](src/screens/) and re-export it as the default export from the route file
3. For protected routes, rely on the auth gate in [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx) or add a guard; do not re-check auth inside the screen

### Add a new synced table

1. Write the Postgres migration: include `updated_at` (with trigger) and `deleted_at` columns; model it on [supabase/migrations/00004_sync_support.sql](supabase/migrations/00004_sync_support.sql)
2. Add the same table to [src/db/schema.ts](src/db/schema.ts) (SQLite mirror) and add its name to `SYNCED_TABLES`
3. Update [src/db/types.ts](src/db/types.ts) with Row / Insert / Update typings
4. That's it — push and pull are driven by `SYNCED_TABLES` and require no further wiring

### Add a new query hook

1. Create or extend a file in [src/queries/](src/queries/) (one file per domain: `workouts.ts`, `sets.ts`, ...)
2. Read via `getDb()` from [src/db/client.ts](src/db/client.ts); always filter `deleted_at IS NULL`
3. Use `enabled: !!userId` so queries don't fire before auth is ready
4. Keep the query key shape consistent with [src/queries/keys.ts](src/queries/keys.ts)

### Add styling

1. Import `theme` from [src/ui/theme.ts](src/ui/theme.ts)
2. Build styles with `StyleSheet.create` at the bottom of the component file
3. Never hard-code colors, spacing, radii, or font sizes — use tokens (`theme.color.text`, `theme.space.s4`, `theme.radius.md`, `theme.font.body`, ...)
4. Ensure interactive elements meet `theme.touch.min` (44pt)

## Testing and typecheck

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (ts-jest + better-sqlite3 mock)
npm run lint
```

After substantive edits run the first two at minimum. The integration test [src/__tests__/offline-workout.test.ts](src/__tests__/offline-workout.test.ts) exercises the full offline-write → outbox → push-on-reconnect path; keep it green.

## Pointers

- Full architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Product overview and domain glossary: [docs/overview.md](docs/overview.md)
- Local-first sync deep dive: [docs/local-first-sync.md](docs/local-first-sync.md)
- Design system: [docs/design-system.md](docs/design-system.md)
- Build and operations: [docs/operations.md](docs/operations.md)
- Cursor-specific rules (narrower, per-glob): [.cursor/rules/](.cursor/rules/)
