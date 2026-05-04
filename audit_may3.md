# Vyayamy Root-Cause Audit

## Executive Summary

Vyayamy is an Expo Router React Native workout journal with a local-first SQLite + Supabase sync architecture. The foundational design decisions (offline-first, outbox pattern, React Query, theme tokens) are sound. However, the app has **critical data integrity risks in its sync engine**, a **catastrophic N+1 query pattern** in the core workout screen, and **zero error feedback** to users across all screens. These three systemic issues are what prevent it from feeling world-class — the user will experience data loss, UI freezes, and silent failures.

---

## Product / UX Root-Cause Findings

### 1. Workout Active Screen — N+1 Query Waterfall

**Severity:** Critical

**Symptom:** The active workout screen (the most-used screen in the app) will feel sluggish with more than 3-4 exercises, and will degrade linearly as exercises are added.

**Root Cause:** `src/queries/workoutDetail.ts` fetches data in nested sequential queries: 1 workout → N workout_exercises → N exercise lookups → N set queries. A workout with 10 exercises triggers **31 sequential SQLite queries** instead of 1 JOIN.

**Affected Files:**
- `src/queries/workoutDetail.ts`
- `src/screens/WorkoutActive.tsx`

**Fix:** Replace with a single SQL query using JOINs (exactly how `src/queries/history.ts` already does it correctly for the history screen).

---

### 2. Zero Error States Across All Screens

**Severity:** Critical

**Symptom:** When any network request, database operation, or mutation fails, the user sees nothing — no error message, no retry button, no indication anything went wrong. Data appears to save but silently doesn't.

**Root Cause:** Every screen except Login returns `null` or shows an empty list on failure. No mutation has `onError` handling. The Toast system exists but is never called from any mutation.

**Affected Files:**
- All screens in `src/screens/`
- All mutations in `src/queries/`

**Fix:** Add `onError` callbacks to all `useMutation` hooks that call `showToast(message, 'error')`. Add error states to all query-driven screens.

---

### 3. Set Deletion Without Confirmation

**Severity:** High

**Symptom:** A user long-pressing a set row (easy to trigger accidentally on mobile) immediately and irreversibly deletes it. No undo, no confirmation.

**Root Cause:** `src/components/SetsTable.tsx` fires `onDeleteSet` directly from `onLongPress` with only haptic feedback.

**Affected Files:**
- `src/components/SetsTable.tsx`

**Fix:** Add a confirmation Alert or swipe-to-delete pattern with undo toast.

---

### 4. Profile Sign-Out Button Shows Wrong Loading State

**Severity:** High

**Symptom:** The sign-out button shows a spinner when a profile name update is pending (unrelated action).

**Root Cause:** `src/screens/Profile.tsx` uses `updateProfile.isPending` for the sign-out button's loading state instead of tracking sign-out state separately.

**Affected Files:**
- `src/screens/Profile.tsx`

**Fix:** Track sign-out state with a separate `useState`.

---

### 5. Exercise Search Has No Debounce

**Severity:** Medium

**Symptom:** ExercisePicker fires a SQLite query on every keystroke, causing input lag on lower-end devices.

**Root Cause:** `src/components/ExercisePicker.tsx` passes the search string directly to `useExercisesSearch()` without debouncing.

**Affected Files:**
- `src/components/ExercisePicker.tsx`

**Fix:** Add 300ms debounce on the search query string.

---

## Architecture Root-Cause Findings

### 6. Sync Engine: Pull Cursor Loses Rows with Identical Timestamps

**Severity:** Critical (silent data loss)

**Symptom:** Rows that share the same `updated_at` value on the server are silently skipped during pull and never appear on the client.

**Root Cause:** `src/sync/pull.ts` advances the cursor to the last row's `updated_at`. The next page fetches `WHERE updated_at > cursor`, which excludes tie rows. Postgres timestamps have microsecond precision but batch operations (triggers, bulk updates) commonly produce identical timestamps.

**Affected Files:**
- `src/sync/pull.ts`

**Fix:** Use a composite cursor `(updated_at, id)` and fetch `WHERE (updated_at, id) > (cursor_ts, cursor_id)`.

---

### 7. Sync Engine: Push Queue Blocked by Single Failed Mutation

**Severity:** High (sync stalls silently)

**Symptom:** If one outbox row fails (e.g., FK violation from cascade), all subsequent mutations are blocked indefinitely. The user's recent work stops syncing.

**Root Cause:** `src/sync/push.ts` processes FIFO and `break`s on first failure. No exponential backoff. After 5 attempts the row is abandoned but stays in the table, and subsequent rows may depend on it.

**Affected Files:**
- `src/sync/push.ts`

**Fix:** Skip failed rows after max attempts (quarantine them), continue processing the rest. Add exponential backoff. Surface blocked state in UI.

---

### 8. Race Condition: Pull Overwrites Pending Local Changes

**Severity:** High (data loss under normal use)

**Symptom:** A user edits a set's weight locally, push hasn't fired yet, pull arrives with old server state for that row. The local change is overwritten.

**Root Cause:** `src/sync/pull.ts` checks the outbox for pending rows but this check is not transactional — between the check and the upsert, the outbox row could be pushed and deleted, allowing the stale pull to overwrite.

**Affected Files:**
- `src/sync/pull.ts`
- `src/sync/engine.ts`

**Fix:** Wrap the outbox check + upsert in a single transaction. Or use version vectors / last-write-wins with wall-clock comparison.

---

### 9. No Foreign Keys in Local SQLite

**Severity:** Medium

**Symptom:** If a workout is deleted but its child records (workout_exercises, sets) are orphaned, the app shows ghost data and the outbox pushes fail on the server.

**Root Cause:** `src/db/schema.ts` intentionally omits FK constraints from SQLite ("mirrors supabase schema 1:1 so sync stays boringly mechanical"). But `PRAGMA foreign_keys = ON` is set in `src/db/client.ts`, making it a no-op — misleading.

**Affected Files:**
- `src/db/schema.ts`
- `src/db/client.ts`

**Fix:** Either add FK constraints with CASCADE to match Postgres, or remove the misleading PRAGMA.

---

### 10. History Query Is Unbounded

**Severity:** Medium (degrades over time)

**Symptom:** After months of use, the History screen will load all workouts into memory at once, causing scroll jank and memory pressure.

**Root Cause:** `src/queries/history.ts` has `LIMIT 50` hardcoded but no pagination/infinite-scroll mechanism. As the user accumulates hundreds of workouts, this limit is either too restrictive (missing data) or will be removed, causing perf issues.

**Affected Files:**
- `src/queries/history.ts`
- `src/screens/History.tsx`

**Fix:** Implement cursor-based pagination with `useInfiniteQuery`.

---

## Design System / UI Consistency Findings

### 11. Progress Screen Uses `useMemo` for Async Side Effects

**Severity:** High

**Symptom:** Chart data may show stale values, flash, or fail to load when switching exercises.

**Root Cause:** `src/screens/Progress.tsx` calls an async function inside `useMemo` with a cancellation flag — this is an anti-pattern. `useMemo` is for synchronous computations; async operations should use `useEffect` or a React Query hook.

**Affected Files:**
- `src/screens/Progress.tsx`

**Fix:** Convert to `useQuery` or `useEffect` + `useState`.

---

### 12. LineChart Dimensions Not Reactive

**Severity:** Medium

**Symptom:** Chart breaks or renders incorrectly on orientation change or split-screen.

**Root Cause:** `src/ui/LineChart.tsx` uses `Dimensions.get()` at render time (snapshot) instead of `useWindowDimensions()` (reactive).

**Affected Files:**
- `src/ui/LineChart.tsx`

**Fix:** Replace with `useWindowDimensions()`.

---

### 13. Dark Mode Defined But Never Activated

**Severity:** Low (incomplete feature, not broken)

**Symptom:** Theme file defines `dark` color tokens but no `useColorScheme()` integration exists. App is light-only despite `userInterfaceStyle: 'automatic'` in app.config.

**Root Cause:** `src/ui/theme.ts` exports only one `theme` object; no dynamic switching.

**Affected Files:**
- `src/ui/theme.ts`
- `app.config.ts`

**Fix:** Defer until core issues resolved.

---

## Reliability / Performance Findings

### 14. Root Layout Returns `null` During Init

**Severity:** Medium

**Symptom:** Blank white screen on cold start while DB initializes and auth loads.

**Root Cause:** `app/_layout.tsx` returns `null` when `ready === false` and the tabs layout also returns `null` while `loading === true`.

**Affected Files:**
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`

**Fix:** Add a splash-matching skeleton or keep expo-splash-screen visible until ready.

---

### 15. Order Index Race Condition

**Severity:** Medium

**Symptom:** If two exercises or sets are added rapidly, they can get the same `order_index` (both read the current max before either writes).

**Root Cause:** `src/queries/exercises.ts` and `src/queries/sets.ts` both do `SELECT MAX(order_index)` then `INSERT` — a classic TOCTOU race.

**Affected Files:**
- `src/queries/exercises.ts`
- `src/queries/sets.ts`

**Fix:** Use `INSERT ... SELECT COALESCE(MAX(order_index), -1) + 1` in a single atomic statement.

---

### 16. `triggerPush()` Is Fire-and-Forget Everywhere

**Severity:** Medium

**Symptom:** If push fails after a mutation, the user has no idea. They believe their data is saved.

**Root Cause:** Every mutation calls `void triggerPush()` — the `void` operator explicitly discards the promise. No error propagation path exists.

**Affected Files:**
- All files in `src/queries/` that call `triggerPush()`

**Fix:** At minimum, have `triggerPush` failures increment a visible counter via `setSyncState`. Better: await it and show error toasts.

---

## Top 10 Prioritized Fixes (by leverage)

| # | Issue | Category | Severity | Why Highest Leverage |
|---|-------|----------|----------|---------------------|
| 1 | Pull cursor loses tied rows | Sync | Critical | Silent permanent data loss |
| 2 | N+1 query in WorkoutActive | Perf | Critical | Core screen, degrades daily |
| 3 | No error states anywhere | UX | Critical | Users can't recover from failures |
| 4 | Push queue blocked by single failure | Sync | High | Stops all syncing silently |
| 5 | Pull overwrites pending local changes | Sync | High | Data loss under normal use |
| 6 | Set deletion without confirmation | UX | High | Accidental data loss |
| 7 | Progress async anti-pattern | Code | High | Buggy chart rendering |
| 8 | Exercise search no debounce | Perf | Medium | Input lag on core flow |
| 9 | History unbounded query | Perf | Medium | Degrades over time |
| 10 | Root layout blank screen | UX | Medium | Bad first impression |

---

## File-by-File Hotspots

| File | Issues | Priority |
|------|--------|----------|
| `src/sync/pull.ts` | Cursor ties, race condition, non-transactional cursor update | **P0** |
| `src/sync/push.ts` | Queue blocking, no backoff, FIFO dependency ordering | **P0** |
| `src/queries/workoutDetail.ts` | N+1 sequential queries | **P0** |
| `src/screens/WorkoutActive.tsx` | No error states, query with undefined ID, timer coupling | **P1** |
| `src/screens/Progress.tsx` | Async in useMemo anti-pattern | **P1** |
| `src/components/SetsTable.tsx` | Long-press delete without confirmation | **P1** |
| `src/sync/engine.ts` | No cancellation, lastError never cleared | **P1** |
| `src/screens/Today.tsx` | No error states, missing loading UI | **P2** |
| `src/screens/History.tsx` | Unbounded fetch, no pagination | **P2** |
| `src/screens/Profile.tsx` | Wrong loading state on sign-out, form reset on refetch | **P2** |
| `src/components/ExercisePicker.tsx` | No debounce on search | **P2** |
| `src/queries/history.ts` | No pagination mechanism | **P2** |
| `src/ui/LineChart.tsx` | Non-reactive dimensions | **P3** |
| `src/db/schema.ts` | Missing indexes, no FKs locally | **P3** |
| `src/db/mutations.ts` | Upsert overwrites without merge, no validation | **P3** |
| `app/_layout.tsx` | Returns null during init (blank screen) | **P3** |

---

## Quick Wins (< 1 hour each)

| # | Fix | Time | Impact |
|---|-----|------|--------|
| 1 | Add `onError` toast to all mutations | 30 min | Massive UX improvement |
| 2 | Debounce ExercisePicker search | 10 min | Eliminates input lag |
| 3 | Fix sign-out button state | 5 min | Fixes confusing UX |
| 4 | Replace `Dimensions.get` with `useWindowDimensions` | 10 min | Fixes chart on rotation |
| 5 | Add confirmation dialog to set deletion | 20 min | Prevents accidental loss |
| 6 | Remove misleading `PRAGMA foreign_keys = ON` | 1 min | Reduces confusion |
| 7 | Show splash screen until `ready === true` | 15 min | Fixes blank screen |

---

## Structural Refactors (1-3 days each)

| # | Refactor | Effort | Impact |
|---|----------|--------|--------|
| 1 | Rewrite `workoutDetail.ts` with single JOIN query | 1 day | Replaces 31 queries with 1 |
| 2 | Fix pull cursor to composite `(updated_at, id)` | 1 day | Prevents data loss |
| 3 | Make pull outbox-check + upsert transactional | 0.5 day | Prevents race condition |
| 4 | Refactor push.ts to skip/quarantine failed rows | 1 day | Unblocks sync queue |
| 5 | Add exponential backoff to push retries | 0.5 day | Handles transient failures |
| 6 | Add pagination to history | 1 day | Prevents perf degradation |
| 7 | Convert Progress chart to `useQuery` | 0.5 day | Fixes async anti-pattern |
| 8 | Clear `lastError` on successful sync cycle | 0.5 day | Fixes stale error states |

---

## Things to Defer

| # | Item | Reason |
|---|------|--------|
| 1 | Dark mode activation | Cosmetic, not broken |
| 2 | HealthKit/Health Connect integration | Phase 6 stubs are fine |
| 3 | Internationalization | English-only acceptable for v0.1 |
| 4 | Full accessibility audit | Important but not blocking v1 |
| 5 | Template/plan editing improvements | Secondary flow |
| 6 | Push notifications for rest timer | Works without it |
| 7 | Data export functionality | Not core to workout logging |

---

## Recommended Implementation Order

### Week 1: Fix Data Integrity (Sync Engine)

**Goal:** Eliminate silent data loss.

1. Fix pull cursor to composite `(updated_at, id)` — `src/sync/pull.ts`
2. Make outbox check + upsert transactional in pull — `src/sync/pull.ts`
3. Skip/quarantine failed rows in push (don't block queue) — `src/sync/push.ts`
4. Add exponential backoff to push retries — `src/sync/push.ts`
5. Clear `lastError` on successful sync cycle — `src/sync/engine.ts`

### Week 2: Fix Core Performance + UX

**Goal:** Make the primary workout flow fast and recoverable.

1. Rewrite `workoutDetail.ts` as single JOIN query — `src/queries/workoutDetail.ts`
2. Add `onError` toast to all mutations across all query files — `src/queries/*.ts`
3. Add error states (with retry) to all screens — `src/screens/*.tsx`
4. Add confirmation to set deletion — `src/components/SetsTable.tsx`
5. Fix Profile sign-out state bug — `src/screens/Profile.tsx`

### Week 3: Polish + Prevent Degradation

**Goal:** Remove remaining friction and future-proof.

1. Add debounce to ExercisePicker — `src/components/ExercisePicker.tsx`
2. Convert Progress chart to `useQuery` — `src/screens/Progress.tsx`
3. Add pagination to History — `src/queries/history.ts`, `src/screens/History.tsx`
4. Fix LineChart to use `useWindowDimensions` — `src/ui/LineChart.tsx`
5. Keep splash screen until app ready — `app/_layout.tsx`
6. Add missing indexes to SQLite schema — `src/db/schema.ts`
7. Fix order_index race condition — `src/queries/exercises.ts`, `src/queries/sets.ts`
