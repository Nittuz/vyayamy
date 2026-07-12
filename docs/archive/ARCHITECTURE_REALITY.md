# FlexYug Architecture Reality

> This document describes the FlexYug architecture as it actually exists on `main`, verified file by file, not as it was designed.
> Snapshot: commit `c8412ae`, 2026-06-10. 439/439 tests green, tsc clean, eslint 0 errors.
> The full 16-dimension deep review, fix phases, and finding appendix live in `docs/specs/2026-06-10-deep-review-improvement-plan.md`.

## 1. Data ownership model

SQLite is the source of truth. Every user action commits to the local `flexyug.db` (expo-sqlite, opened in `getDb()` in `src/db/client.ts`) before anything else happens. Supabase Postgres is a background mirror, reached only through an outbox queue in `src/sync/`. The app is fully usable with the network off; sync is replay, not the write path.

Ownership rules, all enforced in code today:

- **Reads**: TanStack Query caches SQLite query results. No `queryFn` performs HTTP. HTTP exists only in `src/sync/` and `src/auth/`.
- **Writes**: screens call hooks in `src/queries/*`, which call primitives in `src/db/*`. The local apply and its outbox record commit in one transaction (`enqueueMutation()` in `src/db/mutations.ts`).
- **Layering**: the queries layer never imports `src/sync/`. The only cross-layer signal is an in-process mutation event bus (`src/db/mutationEvents.ts`); the sync engine subscribes, queries emit (#34 refactor, commit caca145).
- **Supabase client boundary**: only `src/auth/**` and `src/sync/**` may import `@/auth/supabase`, enforced by `no-restricted-imports` in `.eslintrc.js` (#35). Grep confirms exactly three importers outside `src/auth`: `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/engine.ts`. Everything else goes through the facade `src/auth/authActions.ts`.
- **`personal_records` is a local derived cache**, never pushed or pulled. It is recomputed from completed sets (which do sync). This demotion (commit c0254f3, findings #138-145) removed an entire class of cross-device PK collisions and last-write-wins regressions.
- **Server-owned clock**: `updated_at` is stripped from every push payload (`stripServerOwned()` in `src/sync/push.ts`); the Postgres trigger in `supabase/migrations/00009_security_hardening.sql` is authoritative.

## 2. SQLite schema as it exists

One exported SQL string, `LOCAL_SCHEMA_SQL` in `src/db/schema.ts`, all `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Conventions: UUIDs as TEXT, ISO-8601 TEXT timestamps, and every mutable table carries `created_at` / `updated_at` / `deleted_at` (soft-delete tombstones for sync). The local schema declares zero FOREIGN KEY and zero CHECK constraints; referential integrity is application-level.

### Tables (15)

| Table                   | Purpose                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`              | User profile, including display-unit preference (`units` NOT NULL DEFAULT `'kg'`)                                                  |
| `exercises`             | Exercise catalog; global rows have `user_id` NULL, custom rows are owned                                                           |
| `workouts`              | Workout session; `ended_at` NULL means active                                                                                      |
| `workout_exercises`     | Join row: an exercise instance inside a workout, with `order_index`                                                                |
| `sets`                  | Individual set: `weight` REAL, `reps` INTEGER, nullable `units` (`'kg'`/`'lb'`), `completed`, `completed_at`                       |
| `personal_records`      | Local derived PR cache, not synced (see section 8)                                                                                 |
| `templates`             | Saved workout templates; `exercise_order` is a JSON array column                                                                   |
| `training_plans`        | A user's plan (`plan_type`, `is_active`, `cycle_cursor`)                                                                           |
| `training_plan_slots`   | Day/cycle slots of a plan                                                                                                          |
| `plan_presets`          | Server-seeded preset plan catalog                                                                                                  |
| `plan_preset_templates` | Templates inside a preset                                                                                                          |
| `plan_preset_exercises` | Exercises in a preset template                                                                                                     |
| `plan_preset_slots`     | Day/cycle slots of a preset                                                                                                        |
| `outbox`                | Client-only queue of pending mutations (`table_name`, `op`, `row_id`, `payload_json`, `attempts`, `last_error`, `next_attempt_at`) |
| `sync_meta`             | Client-only per-table incremental-pull cursor (`last_pulled_at`, `last_pulled_id`)                                                 |

`SYNCED_TABLES` (`src/db/schema.ts`, 12 entries): `profiles, exercises, workouts, workout_exercises, sets, templates, training_plans, training_plan_slots, plan_presets, plan_preset_templates, plan_preset_exercises, plan_preset_slots`. The comment directly above it states that `personal_records` is intentionally excluded. `outbox` and `sync_meta` are client-only by nature.

Notable indexes: a partial index for active-workout lookup (`idx_workouts_ended` on `workouts(user_id) WHERE ended_at IS NULL`), a partial index for completed sets (`idx_sets_completed_at`), and a UNIQUE index `idx_pr_unique` on `personal_records(user_id, exercise_id, type)` (one PR row per type per exercise). The outbox is indexed on `created_at` and `next_attempt_at` only; there is no `(table_name, row_id)` index (open #64).

### Per-set units model

`sets.units` records the unit the weight was logged in, per set, so toggling the profile preference never reinterprets history (fix for critical #131). Stamping sites: every weight edit in `src/screens/WorkoutActive.tsx` `onChangeWeight` patches `{ weight, units }` with the profile unit at log time; the auto-staged next set copies the session unit; voice dispatch (`dispatchCommand` case `'setValues'` in `src/voice/dispatch.ts`) lets a spoken unit override the profile unit (#133). NULL is legal only for staged sets with no weight. Every reader falls back to kg on NULL: `sumVolume()` and `toKg()` in `src/core/units.ts` (which also owns the exact constant `KG_PER_LB = 0.45359237`), `computePRs()` in `src/core/pr-detection.ts`, `getHeaviestWeightHistory()` in `src/queries/personalRecords.ts`, and display in `src/screens/HistoryDetail.tsx`. Legacy rows were backfilled with the owner's then-current profile unit, locally in `initDb()` and server-side in `supabase/migrations/00011_set_units.sql`.

### Local migrations

`initDb()` in `src/db/client.ts`, called once at boot from `app/_layout.tsx`:

1. `PRAGMA journal_mode = WAL`; `PRAGMA foreign_keys = ON` (dead, since no local FK constraints exist).
2. `execAsync(LOCAL_SCHEMA_SQL)`: pure `IF NOT EXISTS` bootstrap.
3. Two in-place migrations via `tryAlter()`: `outbox.next_attempt_at` and `sets.units`. `tryAlter` swallows every error on the assumption it means "column already exists".
4. Idempotent units backfill for weight-bearing NULL-unit sets.
5. `PRAGMA user_version` handling: `SCHEMA_VERSION = 4` is stamped, and a downgrade only produces a `console.warn`. No migration is gated on the version; every `tryAlter` runs on every boot. This is open high-severity finding #57: the versioning is decorative, and a real ALTER failure (disk full, locked DB) is indistinguishable from a benign duplicate-column error.

The Postgres schema (`supabase/migrations/00001` through `00011`) is mirrored by hand, not generated. Known divergences (open #63, low): the dead `foreign_keys` pragma, Postgres CHECK constraints with no local equivalent (for example `sets_units_check` in `00011`), and a server-side `personal_records` index (`00010`) for a table that no longer syncs.

## 3. Local write path, step by step

Example: completing a set in the active workout.

1. **UI gesture**: `onComplete` in `src/screens/WorkoutActive.tsx`, guarded by a `completingRef` against double-fire (#16). It calls `updateSet.mutate({ setId, weId, patch: { completed: true } })`, starts the rest timer, then auto-stages the next set via a direct `addSet()` call and refreshes the workout detail query.
2. **Mutation hook**: `useUpdateSet()` in `src/queries/sets.ts`, a TanStack `useMutation`. `onMutate` mirrors the patch into the cached set list optimistically (purely to kill a visual flicker; SQLite, not the cache, is authoritative), `onError` rolls back, `onSettled` invalidates via `invalidateSetWrite()`.
3. **Write function**: `updateSet()` in `src/queries/sets.ts` merges the patch, stamps or clears `completed_at`, and calls `enqueueMutation()`.
4. **Transactional apply plus outbox append**: `enqueueMutation()` in `src/db/mutations.ts` runs inside one `withTransaction()`: the SQLite UPDATE (or upsert-style INSERT, or soft-delete), then the `INSERT INTO outbox` row. Deletes first run `cascadeSoftDelete()`, which walks `SOFT_DELETE_CASCADE` (workouts to workout_exercises to sets; training_plans to training_plan_slots) depth-first, tombstoning each live child and enqueuing a child delete in the same transaction. The UI never sees partial state.
5. **Transaction primitive**: `withTransaction()` in `src/db/transaction.ts` is an app-wide non-reentrant FIFO mutex (a `locked` flag plus a `waiters` queue) around explicit BEGIN/COMMIT/ROLLBACK. It exists because local mutations, sync push, sync pull, and quarantine repair all share one connection, and expo-sqlite's built-in transaction helper masks the original error when ROLLBACK itself throws.
6. **Commit signal**: after commit, `emitMutationCommitted()` (`src/db/mutationEvents.ts`) notifies a plain listener set; each listener runs in try/catch so a misbehaving subscriber cannot break the write path.
7. **Debounced push**: `startSyncEngine()` in `src/sync/engine.ts` subscribes to the bus. If online, it resets a 50 ms debounce timer and then calls `triggerPush()`, so a burst (finishing a workout enqueues the `ended_at` update plus N staged-set deletes) coalesces into one push.

One hot path bypasses `enqueueMutation`: `addSet()` in `src/queries/sets.ts` hand-rolls the transaction so it can compute `MAX(order_index) + 1` inside the same transaction as the insert and outbox append, preventing two rapid taps from minting duplicate `order_index` values. It still emits the commit event.

## 4. Outbox behavior

### Flush triggers (event-driven only, no polling)

`grep setInterval src/sync/` returns nothing. The five triggers, all wired in `startSyncEngine()` (`src/sync/engine.ts`):

1. Mutation bus event, debounced 50 ms, then `triggerPush()`.
2. Network regain (NetInfo listener; online means `isConnected && isInternetReachable !== false`), runs `runSyncCycle()` (push then pull).
3. App foreground (AppState `'active'` while online), runs `runSyncCycle()`.
4. Auth `SIGNED_IN` / `TOKEN_REFRESHED`, runs `runSyncCycle()`.
5. A self-scheduled backoff retry timer (below).

Manual paths: the diagnostics sheet's "Force sync now" calls `runSyncCycle()`; quarantine retry calls `triggerPush()`. The NetInfo, AppState, and auth listeners (triggers 2-4) are wrapped in `safeListener()`, which reports thrown handlers to Sentry; the mutation-bus subscriber (trigger 1) and the retry-timer callback (trigger 5) are plain callbacks that instead rely on the bus's per-listener try/catch in `emitMutationCommitted()` (`src/db/mutationEvents.ts`) and `triggerPush()`'s internal catch, where errors are swallowed or recorded as `lastError`, not reported to Sentry. `triggerPush()` and `triggerPull()` are single-flight: concurrent calls coalesce onto the in-flight promise.

### Ordering and draining

`drainBatch()` in `src/sync/push.ts` selects rows with `attempts < 5`, `next_attempt_at` due, and a NOT EXISTS predicate excluding any row that has an earlier pending op for the same `(table_name, row_id)`, ordered by outbox `id`, limit 50. This is strict per-row FIFO (the #0 critical fix, commit 548804a): an update can never ship while the same row's insert is still failing, but a backed-off row never blocks other rows. `pushOutbox()` loops `drainBatch()` until a pass ships zero rows (#5), which both drains outboxes larger than 50 and releases same-row successors in the next pass. Regression tests: `src/sync/__tests__/pushOrdering.test.ts`, `pushDrain.test.ts`.

### Per-op semantics and deduplication

- `insert`/`upsert`: sent as a PostgREST **upsert keyed on the PK id**. This is the dedup story: if the app dies after the server write but before the outbox row is deleted, the replay is an idempotent upsert, not a duplicate-key insert.
- `update`: `.update(payload).eq('id', rowId).select('id')`. `assertServerRowMatched()` throws when zero rows matched, because a zero-row PostgREST update reports no error and would otherwise silently drop the write; the miss now marches toward quarantine instead (#0 row-count fix).
- `delete`: soft delete only, `.update({ deleted_at }).eq('id', ...)`. The client never sends a hard DELETE.

On success the outbox row is deleted. `reconcileLocalRowId()` and the composite-conflict-target upsert branch still exist in `push.ts` but are unreachable: `UPSERT_CONFLICT_TARGET` is an empty object since `personal_records` left sync. Latent capability for future composite-unique tables, not active flow.

### Retry logic and quarantine

`isTransientError()` (`src/sync/push.ts`, #3) classifies 401/403/429/5xx, JWT codes `PGRST301`/`PGRST302`, and network/timeout/rate-limit message substrings as transient: `attempts` is not incremented, only `last_error` is recorded, and the row retries on the next cycle. Everything else (constraint violations, row-count misses) is permanent: `attempts += 1` with exponential backoff `min(1000 * 2^attempts, 30s)` written to `next_attempt_at`. At `MAX_ATTEMPTS = 5` the row is quarantined. After each push, the engine schedules one `setTimeout` for the earliest `next_attempt_at` via `__setRetryScheduler()` (push cannot import engine, so the scheduler is injected).

Quarantine (`src/sync/quarantine.ts`): rows sit until user action. Surfaces: `QuarantineBanner` on Today (only for rows older than 24 h, `STALE_THRESHOLD_MS`) and the `QuarantineSheet` reached from the SyncIndicator pill's diagnostics sheet, with per-row Retry/Discard plus Retry all/Discard all. Retry resets `attempts = 0` and pushes. Discard of an insert cascades (`cascadeDiscard`, #6): hard-deletes local FK children and every outbox op targeting them, restricted to `SAFE_TABLES`; discard of a delete un-tombstones the local row; discard always removes every outbox op for that row so no sibling op dangles.

### State reporting

`src/sync/state.ts` is a framework-free pub/sub holding `SyncState`: `online`, `pushInFlight`, `pullInFlight`, `pendingOutbox`, `quarantinedOutbox`, `lastPushedAt`, `lastPulledAt`, `lastError`, `lastErrorAt`. The React hook `useSyncStateLive()` (`src/sync/useSyncStateLive.ts`) subscribes to it. `pushOutbox()` recounts the pending and quarantined totals only at the end of each push, so those counts can be stale between pushes; sign-out zeroes them explicitly. The pure `deriveSyncState()` in `src/core/syncHelpers.ts` collapses the struct into `offline | saving | error | saved | idle`, and `syncStateLabel()` maps that to the user-facing copy ("Syncing...", "Saved", "Sync failed", "Offline. Saved locally.", empty for idle). The `SyncIndicator` pill (`src/ui/SyncIndicator.tsx`) renders in the headers of WorkoutActive, History, Progress, and Profile (not Today), and tapping it opens `SyncDiagnosticsSheet` (`src/components/SyncDiagnosticsSheet.tsx`): status plus raw `lastError`, pending and quarantined counts, a last-5 outbox preview (`getOutboxPreview()` in `src/sync/outboxPreview.ts`), pushed/pulled ages, a manual "Force sync now" button, and the quarantine review link.

## 5. Sync pull behavior

**Trigger**: only inside `runSyncCycle()` (network regain, foreground, sign-in/token refresh, manual sync). Push always runs before pull, and pull runs even if push failed (`src/sync/engine.ts`, verified in `engine.test.ts`). There is no pull timer.

**Incremental logic**: `pullOnce()` in `src/sync/pull.ts` fetches all 12 synced tables concurrently (`Promise.all`, #51). Each table uses a keyset cursor stored in `sync_meta`: pages of 500 ordered by `(updated_at, id)`, with the PostgREST filter `updated_at.gt.{ts} OR (updated_at.eq.{ts} AND id.gt.{id})`. The read cursor is rewound 5 seconds (`CURSOR_OVERLAP_MS`) behind the stored cursor so a row whose `updated_at` committed out of order just under the watermark is re-scanned; safe because the merge is an idempotent upsert (#8, test `pullCursorRewind.test.ts`).

**Conflict handling**: column-level merge against the pending outbox, snapshotted inside the same page transaction so it cannot race a local edit (#4). Per server row: any pending local `insert`/`upsert`/`delete` means the server row is skipped entirely (local wins until the outbox drains); pending `update`s protect exactly the locally patched columns, and only the remaining server columns are written via `INSERT ... ON CONFLICT(id) DO UPDATE`. Tombstoned server rows arrive through the same stream and merge like any row; queries filter on `deleted_at IS NULL`, so there is no special tombstone code path.

**Fault isolation (#2)**: each table is try/caught inside the `Promise.all` (failure goes to Sentry tagged `pull_table`, other tables proceed), and each row is try/caught inside the page transaction (failure goes to Sentry tagged `pull_table` and `pull_row`, the row is skipped, the cursor advances). The cursor advance is the sharp edge: see #56 in Known gaps.

**After pull**: `triggerPull()` calls `invalidateAfterSync()`, which invalidates all 9 prefixes in `syncInvalidationRoots` (`src/queries/keys.ts`). Push deliberately invalidates nothing (#47): the local write already refreshed every reader, and invalidating per push caused a whole-app refetch storm per set logged.

**Regression coverage**: the behaviors in sections 4 and 5 are pinned by `src/sync/__tests__/` (`pushOrdering`, `pushDrain`, `transientError`, `pullCursorRewind`, `pullFaultIsolation`, `quarantine`, `quarantineDiscard`, `engine`, `outboxPreview`, `relativeAge`) plus `src/__tests__/sync-state.test.ts` for `deriveSyncState`.

## 6. Supabase touchpoints

- **Client**: one `createClient<Database>` in `src/auth/supabase.ts` with `storage: AsyncStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`, `flowType: 'pkce'`. `resolveSupabaseConfig()` resolves URL/key from `expoConfig.extra`, manifest fallbacks, then env vars, and throws a descriptive error at module load if missing.
- **PostgREST data operations** (`src/sync/push.ts`, `src/sync/pull.ts` only): upsert-by-id for inserts, `update().eq('id')` for updates, soft-delete updates for deletes, `select('*')` keyset pages for pulls, against the 12 `SYNCED_TABLES`. `updated_at` is never sent.
- **Pull-only catalog tables**: `plan_presets`, `plan_preset_templates`, `plan_preset_exercises`, `plan_preset_slots` are synced but no code ever enqueues a mutation against them (grep of all `enqueueMutation` targets confirms). They are server-seeded public-read content (migrations `00006`/`00008`); "apply preset" clones into user tables via `applyPresetAndSavePlan()` in `src/queries/plans.ts`, preferring global catalog exercises (`resolveOrCreateExercise()`). Quarantine discard also refuses preset tables.
- **Auth endpoints** (facade `src/auth/authActions.ts`): `signInWithOtp`, `signInWithPassword`, `signOut`, `exchangeCodeForSession`. Inside the boundary, `getSession()`/`onAuthStateChange` in `src/auth/AuthContext.tsx` and a second `onAuthStateChange` in `src/sync/engine.ts`.
- **Server-side enforcement the client relies on**: RLS plus the `updated_at` trigger in `supabase/migrations/00009_security_hardening.sql`, CHECK constraints (for example `00011`'s units check), and unique constraints that the local schema lacks (#59).

## 7. Auth flow, step by step

1. **Login screen** (`src/screens/Login.tsx`, routed at `app/login.tsx`): one email field, an optional password field, two buttons. Magic link: `handleSubmit()` builds `redirectTo = Linking.createURL('/login')` (scheme `flexyug`, `app.config.ts`) and calls `signInWithOtp()`. Password (#92): `handlePasswordSignIn()` calls `signInWithPassword()`. Both map errors to neutral constants (`MAGIC_LINK_ERROR`, `PASSWORD_ERROR`) so account existence never leaks. An existing session renders `<Redirect href="/" />`.
2. **Deep link plus PKCE exchange**: lives at the root in `RootLayout` (`app/_layout.tsx`), not the login screen, so the code is consumed no matter which screen is open. `handleUrl` parses `queryParams.code` and calls `exchangeCodeForSession()`; both the `Linking` event listener and `getInitialURL()` (cold start) feed it, with an `initialUrlConsumed` ref guarding React 19 strict-mode double-mount.
3. **Session propagation**: `AuthProvider` (`src/auth/AuthContext.tsx`) calls `getSession()` on mount, subscribes to `onAuthStateChange`, and exposes `{ session, user, loading }`. It sets the Sentry user as `{ id }` only (no email, PII).
4. **Single root-level gate (#91)**: `AppNavigator` in `app/_layout.tsx` redirects to `/login` whenever there is no session and the current segment is not `login`, covering every stack route (`workout/active`, `history/[id]`, `profile/plan/*`), not just the tabs. `app/index.tsx` routes `session ? '/(tabs)/today' : '/login'`.
5. **Persistence**: the session (JWT plus refresh token) lives in plaintext AsyncStorage. Moving to expo-secure-store is finding #88, deliberately open, blocked on a new dependency plus a device test.
6. **Sign-out**: `src/screens/Profile.tsx` calls the facade `signOut()`. The engine's auth subscription receives `SIGNED_OUT` and runs `handleSignOut()` (`src/sync/engine.ts`) in this exact order: await the actual in-flight push/pull promises (#1, so a late-resolving cycle cannot write into the fresh DB), reset sync state, `clearAllUserScopedKv()` (#36: UI modules self-register their keys via `registerUserScopedKv` in `src/lib/kvStore.ts`, so sync never imports UI), `queryClient.clear()`, then `resetLocalDb()` (`src/db/client.ts`: close, delete the DB file, re-run `initDb()` so a same-session re-sign-in has tables, with a `wipeAllTables()` fallback if file deletion fails). The root gate then redirects to `/login`.

### Boot sequence (context for the gate)

`RootLayout` in `app/_layout.tsx`, exact order: `initErrorReporting()` and splash-hide prevention at module scope; on mount, `hydrateSnapshot()` fires without await while `initDb()` is awaited under a timeout race (`INIT_TIMEOUT_MS`, 5 s native / 15 s web); on success `startSyncEngine(queryClient)` starts, on failure `bootError` is set, and the splash hides in `finally`. The render tree is `ErrorBoundary` > `GestureHandlerRootView` > `SafeAreaProvider` > `SkinProvider` > `QueryClientProvider` > `AuthProvider` > `ToastProvider` > [`AppNavigator`, `BootOverlay`]. The Stack always renders so expo-router has a root navigator; loading and error states are overlays. `BootOverlay` holds first paint until `ready && fontsLoaded && hydrated`, where `hydrated` gates on the persisted skin loading from AsyncStorage to prevent a default-skin flash. The engine starts before sign-in and is not session-gated: the NetInfo subscription in `startSyncEngine()` (`src/sync/engine.ts`) fires an immediate cycle when the device is online, so a pre-sign-in pull runs unauthenticated, 401s, and sets `lastError` (neither `src/sync/push.ts` nor `src/sync/pull.ts` checks for a session, and `isTransientError()` in `src/sync/push.ts` classifies the 401 as transient, so nothing quarantines). The auth `SIGNED_IN` event re-runs the cycle once a session exists; that is the first cycle that lands data.

## 8. React Query role

React Query is a cache over SQLite, nothing more. Client defaults (`app/_layout.tsx`): `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`. `gcTime` is never set (library default applies); the only per-query `staleTime` override is 5 s on the quarantine list.

Key roots live in `queryKeys` (`src/queries/keys.ts`): `workouts` (with `.active`, `.recent`, `.withExercises`, and the `.detailRoot` prefix that matches every mounted detail query), `exercises` (search keys include `userId` so two accounts on one device do not collide), `sets` (per-WE lists and weight history both under the `['sets']` root so pull invalidation catches them), `profile`, `personal_records`, `templates`, `history`, `plans.active`, `plan_presets`.

Invalidation strategy, in full:

- **Set writes (#11)**: `setWriteInvalidationKeys(weId)` in `src/queries/keys.ts` is the single source of truth: exactly the per-WE set list plus `workouts.detailRoot`, so every local reader refreshes with no network round-trip. Consumed by `invalidateSetWrite()` in `src/queries/sets.ts`.
- **Workout mutations**: `useFinishWorkout` invalidates `workouts.all`, `history(userId)`, `personalRecords(userId)` (`src/queries/workouts.ts`).
- **Pull**: invalidates all 9 `syncInvalidationRoots` prefixes.
- **Push**: invalidates nothing (#47, comment in `triggerPush()`).
- **Sign-out**: `queryClient.clear()`.

**The `personal_records` special case**: recompute is authoritative and writes PRs down as well as up. `recomputeExercisePRsInternal()` (`src/queries/personalRecords.ts`) selects completed, non-tombstoned sets from finished workouts only, normalizes to canonical kg via `computePRs()` (`src/core/pr-detection.ts`, #132), then per PR type updates, inserts, or hard-deletes the cache row. All recomputes serialize through one promise chain (#141) to avoid races on `idx_pr_unique`. Exactly two external triggers exist: `finishWorkout()` calls `recordWorkoutPRs()` best-effort, and the Progress screen mount calls `recomputeAllPRs()` once per user per app session (`src/screens/Progress.tsx`). The docblock claims recompute also runs "after a pull", but no pull-path caller exists; pull only invalidates the `['personal_records']` root, and recompute from pulled sets happens lazily on the next Progress mount. Display converts the stored kg value into the caller's unit (`formatDisplay()`); the Progress chart reads straight from `sets`, not the PR cache (`getHeaviestWeightHistory()`).

## 9. Offline behavior

| Capability                       | Offline             | Mechanism                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log/edit/delete sets             | Fully works         | Row plus outbox entry in one transaction (`src/queries/sets.ts`, `src/db/mutations.ts`); local invalidation via `setWriteInvalidationKeys` (#11); the engine's bus subscriber skips the push while offline                                                                          |
| Create/finish workouts           | Fully works         | Same outbox pattern; `finishWorkout()` also prunes incomplete staged sets (#12) and recomputes PRs locally                                                                                                                                                                          |
| Voice logging                    | Fully works         | On-device recognition only: `requiresOnDeviceRecognition: true` in `onDeviceEngine` (`src/voice/speechEngine.ts`)                                                                                                                                                                   |
| Rest timer plus alert            | Fully works         | Local scheduled notification (`scheduleRestDone()` in `src/lib/restNotifications.ts`); timer persisted in user-scoped KV and restored (`useRestTimer` in `src/ui/hooks/useRestTimer.ts`); notification tap routes to `/workout/active` even on cold start (#159, `app/_layout.tsx`) |
| History, detail, exercise search | Fully works         | Pure SQLite queryFns (`src/queries/history.ts`, `src/queries/sets.ts`, `src/queries/exercises.ts`)                                                                                                                                                                                  |
| PRs and Progress chart           | Fully works         | Local derived cache plus chart series computed from local `sets`                                                                                                                                                                                                                    |
| Today first paint                | Fully works         | `hydrateSnapshot()` from AsyncStorage races `initDb()` at boot (`app/_layout.tsx`, `src/ui/todaySnapshot.ts`)                                                                                                                                                                       |
| Sync status UI                   | Degrades gracefully | `deriveSyncState()` returns `'offline'`, label "Offline. Saved locally." (`src/core/syncHelpers.ts`). Caveat: initial state is optimistically `online: true` until NetInfo first fires (`src/sync/state.ts`)                                                                        |
| Sign-in (both paths)             | Needs network       | Supabase HTTP calls; a signed-out device offline is fully unusable because the #91 gate redirects every route to `/login`                                                                                                                                                           |
| Catch-up on reconnect            | Automatic           | NetInfo online transition and app foreground both run `runSyncCycle()`; backed-off rows wake via the self-scheduled retry (#5)                                                                                                                                                      |

Rough edges: no outbox coalescing, so every offline set edit is its own outbox row and its own HTTP request on reconnect (#50, deferred by design: merging rows races an in-flight push and risks data loss; the 50 ms debounce and the #14 stepper fix mitigate the symptom). Pull is fragile to server schema skew (#56, below). Rows that fail push five times land in the quarantine UI.

## 10. Error handling

- **Mutation hooks to toasts**: hooks take an optional `onError(msg)` callback that screens wire to a toast. Present on the workout, set, exercise, profile, and repeat-last-workout hooks (`src/queries/workouts.ts`, `sets.ts`, `exercises.ts`, `profile.ts`, `repeatLastWorkout.ts`). Missing on the plan hooks: `useSaveActivePlan` and `useApplyPresetAndSavePlan` in `src/queries/plans.ts` have no `onError`, and `src/screens/PlanSetup.tsx` calls `mutateAsync` with no try/catch, so a failed plan save is an unhandled rejection with zero user feedback (#69, open).
- **Sync-aware suppression**: `useSyncAwareErrorToast()` (`src/ui/ToastContext.tsx`) drops toasts whose message matches `isSyncError()` (`src/ui/syncErrors.ts`); transient sync failures surface through the SyncIndicator pill instead of toasting mid-lift. Used only by WorkoutActive.
- **Root boundary**: `ErrorBoundary` (`src/ui/ErrorBoundary.tsx`) wraps the whole tree, reports via the gated `captureException`, and renders a themed "Something broke" fallback with a reset button.
- **Sentry**: `initErrorReporting()` (`src/lib/errorReporting.ts`) no-ops entirely without a DSN; `beforeBreadcrumb`/`beforeSend` scrub query strings and fragments from URLs on every breadcrumb category (#90), since the magic-link auth code rides in them; `sendDefaultPii: false`, user identified by id only. Caveat: `src/sync/pull.ts` and `src/sync/engine.ts` import `@sentry/react-native` directly and bypass the `initialized` gate.
- **Boot failures**: `initDb()` races a 5 s native / 15 s web timeout; failure sets `bootError` and `BootOverlay` renders a full-screen "Cannot start" with the raw message (`app/_layout.tsx`). The navigator Stack always renders underneath so expo-router has a root navigator.
- **Sync errors**: classified in `isTransientError()`, recorded in `SyncState.lastError`, surfaced via the pill ("Sync failed"), the diagnostics sheet (raw error string, outbox preview, manual sync), the pulsing `SyncErrorStripe` on Today and WorkoutActive, and ultimately the quarantine sheet.
- **Known swallowed errors** (verified current): `finishWorkout()` swallows `recordWorkoutPRs` failures with a bare catch and no telemetry (#146); the root deep-link handler discards the `exchangeCodeForSession` error object, and `AuthContextValue` has no error field, so a failed or expired magic link is fully silent (#94); `getSession()` rejection in `AuthContext` only clears the loading flag. Notification helpers in `src/lib/restNotifications.ts` swallow deliberately and return null/'undetermined'. Login errors are not swallowed; they map to the neutral inline strings.

## 11. Known gaps

Finding numbers reference the deep-review tracker (appendix in `docs/specs/2026-06-10-deep-review-improvement-plan.md`).

**Open, high severity, no owner:**

- **#56 Pull schema-skew fragility.** `pullTable()` builds the local INSERT column list from the server row's keys (`select('*')`). An additive server column unknown to local SQLite makes every row's insert throw; per-row isolation (#2) then skips the row, reports to Sentry, and advances the cursor, so those rows are silently never retried until their `updated_at` changes again after an app update. No column intersection against `PRAGMA table_info` exists. `src/sync/pull.ts`.
- **#57 Decorative local migrations.** `user_version` gates nothing; `tryAlter()` swallows all errors. `src/db/client.ts`.
- **#77 / #79 / #80 Testing gaps.** No end-to-end push/pull integration harness; the 439 green tests are unit and module level.
- **#111 CollisionSheet blocking modal.** `src/components/CollisionSheet.tsx` has no `onRequestClose` and no dismiss path, and forces discarding real workouts.

**Blocked, deliberate:**

- **#88** Supabase JWT in plaintext AsyncStorage; needs expo-secure-store plus a device test.
- **#123** Privacy manifest; needs an EAS build and store verification.

**Partial:**

- **#158** `getRestAlertStatus()` exists with zero callers; Profile has no "Rest alerts" row, so a user who denied notification permission has no surfaced state or Settings deep-link.
- **#22** Seven swept screens still use raw `Text` in places; the full Text-primitive migration is open.
- **#25** PR glow ships; PR-pill live detection and the recap PR card remain open.

**Deferred by design:**

- **#50** No outbox coalescing (data-loss race against an in-flight push); **#49** related.

**Open, medium and low (data and sync layer):**

- **#59** `training_plan_slots` unique/CHECK constraints exist only in Postgres; two-device offline plan edits can produce local duplicates that quarantine on 23505.
- **#61** RLS policies are `FOR ALL` including hard DELETE, but incremental pull can only see soft deletes; a hard DELETE from any JWT-bearing client is invisible to other devices.
- **#63** Local schema is not the claimed 1:1 Postgres mirror (section 2).
- **#64** No `(table_name, row_id)` outbox index; `fetchPendingOutbox()`, the FIFO NOT EXISTS subquery, and quarantine discard all scan it.
- **#154** Pull writes PostgREST `'+00:00'` timestamps verbatim next to local `Z`-suffixed ones; lexicographic `ORDER BY` on mixed formats is a latent mis-ordering footgun.
- **#147** Formally open but premise mooted: PR rows can no longer quarantine since `personal_records` left sync; residue is the dead `RECONCILE_SAFE_TABLES` entry in `src/sync/push.ts`.

**Open, medium and low (UX and error surface):** #69 plan-save failures are silent; #94 failed magic-link exchange is silent; #114 Today has the error stripe but no tap path to diagnostics, and the stripe's pulse loop is never stopped at window expiry; #115 "Discard all" in `QuarantineSheet` has no confirmation; #146 swallowed PR-recompute failures; #164 the `'rest-timer'` notification category is stamped and matched but never registered via `setNotificationCategoryAsync`, so no action buttons exist.

**Deferred pending simulator or device QA:** #24, #26, #29, #30, #66, #27/#116 (44pt audit), #108 VoiceOver, #117 Dynamic Type. **Deferred feature work:** #109/#153 plan-to-Today loop. **Voice, low priority:** #106, #107.

One verification note: `npx prettier --check .` flags 111 files; the format gate was deliberately excluded from CI when CI landed (#126, `.github/workflows/ci.yml`). An EAS build dry run has not been executed (needs credentials); `eas.json` was repaired and hand-verified in commit b85e963.
