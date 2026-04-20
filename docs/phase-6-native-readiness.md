# Phase 6: Native Readiness Architecture

After Phase 6, the Vyayamy codebase separates **domain logic** from
**UI rendering** and **web-platform concerns**. A future native client
(iOS, watchOS, or shared core library) can reuse the domain layer
without reverse-engineering the React UI.

---

## 1. Core Domain Model

All product-level types live in `src/lib/domain.ts`.

| Concept | Type | Notes |
|---------|------|-------|
| Exercise | `Exercise` (DB row) | `user_id = null` → global seed |
| Template | `Template` (DB row) | Ordered exercise list |
| Plan | `TrainingPlan` + `TrainingPlanSlot` | Weekly or rotating cycle |
| Workout | `Workout` (DB row) | `ended_at = null` → active |
| Workout Exercise | `WorkoutExercise` (DB row) | Links workout ↔ exercise |
| Set | `Set` (DB row) | Weight, reps, completion |
| Personal Record | `PersonalRecord` (DB row) | Opaque `Json` value column |
| Profile | `Profile` (DB row) | Units preference (`kg`/`lb`) |

**Product-level types** (not in the DB schema):

| Type | Purpose |
|------|---------|
| `Units` | `'kg' \| 'lb'` |
| `PRType` | `'heaviest_weight' \| 'best_volume' \| 'most_reps_at_weight'` |
| `PRValue` | Discriminated union that narrows the opaque `Json` PR value |
| `WorkoutSummary` | Summary shape produced at workout finish |
| `GroupedPR` | PR records grouped and formatted per exercise |
| `SyncState` | `'idle' \| 'saving' \| 'saved' \| 'error' \| 'offline'` |
| `SlotDraft` | Mutable plan-slot representation for the setup wizard |
| `ExportData` / `ExportEnvelope` | Typed export payload with versioning |
| `WEEK_START_DAY` | `1` (Monday) — shared by plan scheduling and analytics |
| `EXPORT_FORMAT` / `EXPORT_VERSION` | Constants for forward-compatible export |

`parsePRValue(type, raw)` and `deriveWorkoutStatus(workout)` are small
pure helpers co-located in `domain.ts`.

---

## 2. Business Logic Layer

All core logic lives in `src/lib/` as pure functions (no React, no DOM,
no Supabase). These modules are the primary candidates for native reuse.

| Module | Contents |
|--------|----------|
| `workoutLogic.ts` | `computeVolume`, `computeSetCounts`, `formatVolume`, `computeElapsedDisplay`, `buildFinishSummary` |
| `prFormatting.ts` | `formatPrValue`, `isRecentPR`, `deduplicateByType`, `groupPrsByExercise`, PR type constants |
| `progressInsights.ts` | Session aggregation, trend classification, exposure, weekly summary, `estimatedE1RM`, next-target suggestion |
| `pr-detection.ts` | `computeBestMetrics` (pure), `detectNewPRs` (pure), `detectAndInsertPRs` (persistence orchestrator) |
| `syncHelpers.ts` | `deriveSyncState`, `syncStateLabel`, `combineMutationFlags` |
| `format.ts` | Date formatting, duration, greeting, initials |
| `analytics.ts` | Event vocabulary (no-op tracker) |

**Portable by design**: these modules import only from `../types/database`
or from each other — never from React, React Router, TanStack Query, or
browser APIs.

---

## 3. Data Access Layer

Query hooks in `src/lib/queries/` handle Supabase communication and
TanStack Query caching. They are React-specific and not portable.

| Module | Domain |
|--------|--------|
| `workouts.ts` | CRUD, active/recent, detail, last-performed sets, delete-all |
| `exercises.ts` | Search, create, recent, by-IDs |
| `sets.ts` | Set CRUD, reorder, finish workout |
| `history.ts` | Past workouts with filters |
| `records.ts` | PRs, exercise history, weekly frequency, multi-exercise trends |
| `profile.ts` | Profile read/update, stats |
| `templates.ts` | Template CRUD |
| `plans.ts` | Plan CRUD, slot helpers, week completions, cycle advance |

A native client would replace these with platform-native data access
(e.g., Swift concurrency + Supabase Swift SDK) while reusing the same
Supabase schema and the pure logic modules above.

---

## 4. Sync / Persistence Model

| State | Meaning |
|-------|---------|
| `idle` | No pending operations |
| `saving` | At least one mutation in flight |
| `saved` | Last mutation succeeded (flashes briefly) |
| `error` | A mutation failed |
| `offline` | Device has no network connectivity |

`deriveSyncState(online, isPending, isError, showSaved)` in
`syncHelpers.ts` encodes the priority logic. `combineMutationFlags()`
aggregates flags from multiple mutations.

**What is NOT modeled yet** (intentionally deferred):

- Offline write queue / optimistic persistence
- Resumable session state (partially completed workout survives app kill)
- Conflict resolution for multi-device sync

These would require backend support (e.g., a local SQLite cache with
sync queue) and are out of scope for the current PWA architecture.

---

## 5. Export / Portability

`src/lib/export.ts` is split into layers:

1. **Data fetching** — `fetchAllUserData(userId)` returns typed `ExportData`
2. **Pure serialization** — `serializeJSON(data)` and `serializeCSV(data)`
   produce strings without DOM dependency
3. **Web download** — `downloadFile(content, filename, mimeType)` triggers
   a browser download
4. **Orchestrators** — `exportJSON` / `exportCSV` combine all three

A native client reuses layers 1-2 and replaces layer 3 with
platform-native file handling (e.g., `UIActivityViewController`).

Export includes `format: 'vyayamy-export-v1'` and `version: 1` for
future backward compatibility.

**Import**: Not yet implemented. The typed `ExportEnvelope` shape
provides a validation target for future import deserialization.

---

## 6. What Remains Web-Specific

These modules are intentionally tied to the web platform:

| Module | Why |
|--------|-----|
| `useOnlineStatus.ts` | `navigator.onLine`, `useSyncExternalStore` |
| `usePWAInstall.ts` | `beforeinstallprompt` event |
| `haptics.ts` | `navigator.vibrate` (guarded) |
| `hooks.ts` | React hooks (`useDebouncedValue`, `useAnimatedPresence`) |
| `routes.ts` | React Router paths, `NavItem` with React icons |
| `chartConfig.ts` | Recharts styling config |
| `supabase.ts` | Vite env vars (`import.meta.env`) |
| All `src/lib/queries/*` | TanStack Query hooks |
| All `src/components/*` | React components |
| All `src/routes/*` | React route components |
| All `src/contexts/*` | React context providers |

---

## 7. What Is Now Better Positioned for Native Reuse

After Phase 6, a native client can directly reuse:

- **Domain types**: entity shapes, PR type system, sync states, export envelope
- **Workout logic**: volume, set counts, elapsed time, finish summary
- **PR detection**: pure metric computation and comparison
- **PR formatting**: display values, grouping, recency checks
- **Progress insights**: trend classification, session aggregation, exposure, suggestions
- **Formatting**: date/time display, duration strings
- **Export serialization**: JSON and CSV generation from typed data
- **Identifiers**: stable UUIDs from Supabase, consistent week-start convention

---

## 8. Intentionally Deferred

| Item | Reason |
|------|--------|
| Offline write queue | Requires local database + sync protocol |
| Resumable workout sessions | Needs persistent local state beyond React Query cache |
| Full import/restore | Needs validation, conflict handling, migration |
| `best_estimated_1rm` PR type | Backend schema change needed |
| `set_id` on PR records | PR provenance tracking, minor schema enhancement |
| Multi-user workout_exercises filter | RLS handles it today; explicit join needed for shared exercises |
| TrainingPlan.tsx subcomponent extraction | Heavy but mostly UI; lower ROI |
