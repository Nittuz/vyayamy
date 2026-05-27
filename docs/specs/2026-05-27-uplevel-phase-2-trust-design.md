# Uplevel Phase 2 — Trust

- **Status:** implemented
- **Date:** 2026-05-27
- **Related ADRs:** none new; respects [ADR-0001](../adr/0001-sqlite-as-source-of-truth.md) (SQLite source of truth), [ADR-0002](../adr/0002-outbox-over-crdt.md) (outbox pattern)
- **Builds on:** [Phase 1 — Signature](2026-05-26-uplevel-phase-1-signature-design.md) (implemented)

## Problem

Phase 1 shipped the Signature — the app looks and feels like itself. Phase 2 ships the Trust — a lifter can drop their phone mid-set, get a phone call, lose connection, switch devices, force-quit the app, and the data they typed *and the workout they're inside* survive every one of those events.

The 2026-05-26 design audit named five concrete gaps that erode trust:

1. **Typed-but-uncommitted text is lost on interrupt.** The keypad-mode `TextInput` inside `NumericStepperView` commits only on blur. If the OS reaps the app while the user is typing "185", the digits are gone.
2. **Cold-start latency is visible.** Splash holds for 500ms–1s while SQLite warms up. On a sweaty in-between-sets check, that's enough to feel sluggish.
3. **Multi-device collisions are silent.** When two devices both have `ended_at IS NULL` workouts and they sync, `getActiveWorkout` picks the most recent via `LIMIT 1 ORDER BY started_at DESC`. The other workout is in the DB, never surfaced — invisible data loss.
4. **Quarantined outbox rows are invisible.** After 5 push attempts fail, an outbox row sits forever. The user's data is local-only and never reaches Supabase, with no UI to discover or recover.
5. **Rest timer dies on background or crash.** The `useRestTimer` hook holds `(running, startedAt)` in component memory only. A backgrounded app loses the timer state; resumption doesn't pick up where it left off.

Phase 2 closes all five gaps without touching the visual language or the core write path established in Phase 1.

## Goals & non-goals

**Goals**

- **Autosave keypad-mode typing on a 250ms debounce.** Restart a timer on every keystroke; fire `onChange(parsed)` either when the timer elapses (with a valid parse) or immediately on blur. Stepper-chevron entry is already immediate and is not changed.
- **Cold-start Today snapshot.** Persist the Today screen's render-ready state to AsyncStorage on any change to its source queries; restore synchronously at first paint on cold start. Live data replaces the snapshot as queries resolve.
- **Workout-collision blocking sheet.** Detect 2+ unfinished workouts for the user post-pull. Render a sheet over Today that lists each (title, started_at, set + exercise counts) with `Resume` / `Discard` per row. The user explicitly chooses; one becomes active, others soft-delete.
- **Quarantined-outbox banner.** Show a danger-colored banner on Today when any quarantined outbox row is older than 24h. Tap opens a sheet listing stuck rows with per-row `Retry` (reset attempts to 0) and `Discard` (drop from outbox + tombstone local row) actions, plus `Retry all` / `Discard all` footer.
- **Rest timer persistence.** Persist `(startedAt, targetSeconds)` to AsyncStorage on `start()`; clear on `stop()`. On mount, restore only if `elapsed < 2 × targetSeconds` (stale-guard).
- **All five items are independent.** No cross-coupling that would force a single big-bang change.
- **All Phase 1 invariants preserved.** Mutation layer untouched (`src/db/mutations.ts`, `src/sync/*`, `src/queries/*` mutation functions). Visual language unchanged.

**Non-goals**

- **Merging two unfinished workouts.** The collision sheet has `Resume` and `Discard` only. No exercise-list union.
- **In-progress text buffer to eliminate the 250ms debounce window.** YAGNI for a 250ms gap.
- **Backgrounding-triggered snapshot save.** The query-data-change-triggered save already covers it.
- **Per-set granular sync diagnostics.** The quarantine sheet shows row-level entries; deeper traces are Phase 4 (Dimensions) territory.
- **Removing the History tab, "+ Add set" button, dashed border, or unused Reanimated.** Restraint (Phase 3).
- **Multi-device automated test harness.** Manual verification.

## Design

### 1. Keypad-mode autosave (250ms debounce)

**Files touched:**
- `src/components/numericStepper.ts` — add `useDebouncedCommit` hook (pure logic, unit-testable)
- `src/components/NumericStepperView.tsx` — wire the hook into the keypad edit path
- `src/components/__tests__/numericStepper.test.ts` — extend with debounce tests

**Hook signature** (in `numericStepper.ts`):

```ts
export function useDebouncedCommit(
  onChange: (next: number | null) => void,
  debounceMs: number,
): {
  bufferKeystroke: (rawText: string) => void;
  flushNow: () => void; // called on blur
  cancelPending: () => void; // called on unmount
};
```

**Behavior:**
- `bufferKeystroke(raw)` stores the latest text in a ref and (re)starts the timer
- When the timer fires: `parseUserInput(buffered)` → if valid number, call `onChange(parsed)`; if invalid, no-op (don't clobber prior state with garbage)
- `flushNow()` cancels the pending timer and immediately commits the latest buffered text using the same parse-and-onChange logic (used by the existing on-blur path)
- `cancelPending()` clears the timer without committing (used by component unmount; the most-recent committed value remains)
- Empty input (`''`) is treated as "clear" and commits `null` (matches existing on-blur behavior)

**Wire-in:**
- In `NumericStepperView.tsx`, the existing `TextInput` `onChangeText={setEditingText}` is extended to also call `bufferKeystroke(text)`
- The existing `onBlur={commitEdit}` calls `flushNow()` instead of the inline commit
- The internal `editingText` state stays so the TextInput remains controlled

**Edge cases:**
- Rapid typing: each keystroke restarts the timer; only the final value commits 250ms after typing stops
- Long-form numbers (decimals): debouncing applies regardless; if user types "22.5", commit fires once 250ms after the "5"
- Crash within the 250ms window: latest committed value is the previous user input or null. Acceptable. Belt-and-suspenders text-buffer is YAGNI.
- Component unmounts mid-typing: `cancelPending()` in the cleanup avoids a stale state update

### 2. Cold-start Today snapshot

**Files touched:**
- `src/ui/todaySnapshot.ts` — new module, AsyncStorage-backed
- `src/screens/Today.tsx` — read snapshot at first paint, save on data change
- `src/ui/__tests__/todaySnapshot.test.ts` — unit tests against an AsyncStorage mock

**Module API:**

```ts
export interface TodaySnapshot {
  schemaVersion: 1;
  capturedAt: string; // ISO
  state: 'active' | 'repeat' | 'empty';
  // For state === 'repeat':
  repeatTitle?: string;
  repeatDaysAgo?: number;
  repeatSeeds?: ExerciseSeed[];
  // For all states:
  recentRows: { id: string; title: string; daysAgo: number }[];
}

// Read at first paint — synchronous via in-memory cache primed at module load
export function getCachedSnapshot(): TodaySnapshot | null;

// Async hydration — primes the in-memory cache from AsyncStorage on app boot
export async function hydrateSnapshot(): Promise<void>;

// Write — fire-and-forget; called from Today when its queries settle
export function persistSnapshot(snap: TodaySnapshot): Promise<void>;

// Clear — called on sign-out (user's data shouldn't leak across accounts)
export function clearSnapshot(): Promise<void>;
```

**Storage key:** `@flexyug/today-snapshot/v1` (versioned in key; if schema version increments, the old key is orphaned and a new one starts fresh)

**Lifecycle:**
- App boot: `hydrateSnapshot()` runs alongside `initDb()` in `app/_layout.tsx`. The two race; whichever finishes first primes its slice of state. Hydrate is faster than initDb (AsyncStorage is small, KV-based)
- First paint of `Today.tsx`: read via `getCachedSnapshot()`; if truthy, render the snapshot. Live queries (`useLastFinishedWorkoutWithSeeds`, `useActiveWorkout`, `useRecentWorkouts`) populate alongside
- When live data lands: replace the snapshot-driven render. `persistSnapshot()` fires on the new data so the next cold start sees the up-to-date view
- Sign-out: `clearSnapshot()` runs in `useAuth` sign-out handler

**Staleness:**
- Snapshot has `capturedAt`. If `now - capturedAt > 7 days`, ignore the snapshot (clear in-memory cache). User probably hasn't opened the app in a while; show the skeleton loader rather than a stale Repeat card

**Edge cases:**
- AsyncStorage read fails: log to Sentry, ignore the snapshot (render skeleton)
- Schema mismatch (future): `getCachedSnapshot()` checks `schemaVersion === 1`; mismatches return null and clear the key
- User signs in to a different account: the AuthProvider's sign-in path also clears the snapshot

### 3. Workout-collision blocking sheet

**Files touched:**
- `src/queries/activeWorkouts.ts` — new query `useActiveWorkoutCollisions(userId)` (returns array)
- `src/components/CollisionSheet.tsx` — the modal UI
- `src/screens/Today.tsx` — render the sheet when collisions detected
- `src/queries/__tests__/activeWorkouts.test.ts` — integration test

**Query implementation:**

```ts
export async function getActiveWorkoutCollisions(
  userId: string,
): Promise<{
  workouts: Workout[];
  details: Map<string, { setCount: number; exerciseCount: number }>;
}> {
  const db = await getDb();
  const workouts = await db.getAllAsync<Workout>(
    `SELECT * FROM workouts
       WHERE user_id = ?
         AND ended_at IS NULL
         AND deleted_at IS NULL
       ORDER BY started_at DESC`,
    [userId],
  );
  if (workouts.length < 2) return { workouts, details: new Map() };

  const details = new Map();
  for (const w of workouts) {
    const r = await db.getFirstAsync<{ set_count: number; exercise_count: number }>(
      `SELECT
         COUNT(DISTINCT s.id) AS set_count,
         COUNT(DISTINCT we.id) AS exercise_count
       FROM workout_exercises we
       LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.deleted_at IS NULL
       WHERE we.workout_id = ? AND we.deleted_at IS NULL`,
      [w.id],
    );
    details.set(w.id, {
      setCount: r?.set_count ?? 0,
      exerciseCount: r?.exercise_count ?? 0,
    });
  }
  return { workouts, details };
}
```

**Sheet UX:**
- Renders as an overlay on Today when `workouts.length >= 2`
- Title: "Resume which workout?"
- Body: "We found 2 unfinished workouts. Pick one to resume; the others will be discarded."
- For each workout in the list: title, started date (e.g. "Started Tuesday, 2:43pm"), set count, exercise count
- Per-row: `→ Resume` button (accent), `Discard` button (danger text, no fill)
- Resume: fires `discardOtherCollisions(keepId, otherIds)` mutation, then closes sheet and routes to `/workout/active`
- Discard: fires `discardWorkout(id)` mutation; if only one workout remains, sheet auto-closes; if still multiple, sheet stays
- No "Cancel" button — the sheet is blocking by design (you can't use Today until resolved)

**Detection trigger:**
- Today's mount fires `useActiveWorkoutCollisions(userId)`
- The query is also invalidated post-pull. Add a `pullCompleted` callback hook in `sync/engine.ts` that invalidates `queryKeys.workouts.all` on every successful pull (current engine already invalidates on push success; pull-side already does its own invalidation per-table — verify and extend if needed)

**Edge cases:**
- User has 3+ unfinished workouts: same UX, just more rows
- User discards all except one: that one is implicitly "kept" — no further resolution needed
- User discards them all: empty Today, like first launch
- Sync delivers a new collision while the sheet is already open: the live query updates, sheet re-renders with the additional row

### 4. Quarantined-outbox banner

**Files touched:**
- `src/sync/quarantine.ts` — new module: query stuck rows, retry/discard mutations
- `src/components/QuarantineBanner.tsx` — top-of-Today banner
- `src/components/QuarantineSheet.tsx` — detail sheet
- `src/screens/Today.tsx` — render banner
- `src/sync/__tests__/quarantine.test.ts` — integration test

**Module API:**

```ts
export interface QuarantinedRow {
  id: number; // outbox PK
  table_name: string;
  op: string;
  row_id: string;
  payload_json: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export async function getQuarantined(): Promise<QuarantinedRow[]>;
export function useQuarantined(): { rows: QuarantinedRow[]; oldOnes: QuarantinedRow[] };

export async function retryQuarantinedRow(id: number): Promise<void>;
export async function discardQuarantinedRow(id: number): Promise<void>;
export async function retryAllQuarantined(): Promise<void>;
export async function discardAllQuarantined(): Promise<void>;
```

**Constants:**
- `STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000` (24 hours)
- `oldOnes` = rows where `now - created_at > STALE_THRESHOLD_MS`

**Query (uses existing outbox table — no schema change):**

```sql
SELECT * FROM outbox
  WHERE attempts >= 5
  ORDER BY id ASC
```

(The `5` here is `MAX_ATTEMPTS` from `src/sync/push.ts` — import and reuse rather than re-declaring.)

**Mutation: retry a row**
- `UPDATE outbox SET attempts = 0, next_attempt_at = NULL WHERE id = ?`
- Then `void triggerPush()` so the next sync cycle picks it up

**Mutation: discard a row**
- `DELETE FROM outbox WHERE id = ?`
- Plus tombstone the corresponding local row (call the right `enqueueMutation` with `op: 'delete'`) — but wait, that would create a *new* outbox row. The user wanted this thing GONE, not re-queued. Resolution: just `DELETE FROM outbox WHERE id = ?` and leave the local table row alone. The user is consciously orphaning the data. The discard sheet UI makes this explicit ("This will remove the change locally without syncing it.")

**Banner UX:**
- Hidden when `oldOnes.length === 0`
- Visible at top of Today: a danger-colored pill with `${oldOnes.length} items didn't sync · Tap to review`
- Tap → opens `QuarantineSheet`
- Once user resolves all stale rows (retry or discard each), banner disappears

**Sheet UX:**
- Title: "Stuck syncs"
- Body: "These changes haven't reached the server after multiple tries. Retry sends them back to the queue; Discard removes them locally."
- Per-row: human-readable summary based on `table_name + op + payload_json` (e.g. `sets · 185 × 5` for an insert/update set; `workouts · "Push"` for a workout)
- Per-row actions: `Retry` / `Discard`
- Footer: `Retry all` / `Discard all`

**Edge cases:**
- Banner appears while user is mid-flow on Today: that's by design; the banner is sticky once stuff is stale
- New rows quarantine while sheet is open: live query refreshes sheet
- User retries all and they all succeed: banner disappears next render
- User retries all and they re-fail (still no network): banner returns 24h later — acceptable

### 5. Rest timer persistence

**Files touched:**
- `src/ui/hooks/useRestTimer.ts` — modify to read/write AsyncStorage
- `src/ui/hooks/__tests__/useRestTimer.test.ts` — new test file (pure logic — extract `restorePolicy` for testing)

**Storage key:** `@flexyug/rest-timer/v1` — single-tenant (rest timer is global to the active workout)

**Stored shape:**

```ts
interface PersistedTimer {
  schemaVersion: 1;
  startedAt: number; // epoch ms
  targetSeconds: number;
}
```

**Behavior:**
- `start()`: write `{ schemaVersion: 1, startedAt: Date.now(), targetSeconds }`
- `stop()`: clear the key (AsyncStorage `removeItem`)
- On mount: read the key. If present and `now - startedAt < 2 × targetSeconds`, restore (set `running = true`, compute live `elapsed`). Otherwise, clear stale data.

**Pure restore policy (testable):**

```ts
export function shouldRestoreTimer(
  persisted: PersistedTimer | null,
  now: number,
): { restore: boolean; clearStale: boolean } {
  if (!persisted) return { restore: false, clearStale: false };
  if (persisted.schemaVersion !== 1) return { restore: false, clearStale: true };
  const elapsed = now - persisted.startedAt;
  if (elapsed < 0) return { restore: false, clearStale: true }; // clock skew
  if (elapsed > 2 * persisted.targetSeconds * 1000) return { restore: false, clearStale: true };
  return { restore: true, clearStale: false };
}
```

**Edge cases:**
- Clock-skew on restore (negative elapsed): clear, don't restore
- Stale entry from a week ago: clear, don't restore
- App killed exactly at target second: on restore, elapsed > target → `timerValueDone` styling applies, haptic doesn't re-fire (only on threshold-crossing)
- User starts a workout, gets a call, comes back 10 minutes later: target is usually 90s; 600s > 180s threshold → clear, don't restore. Acceptable — user wasn't in active rest

### Cross-cutting

**Storage layer abstraction.** AsyncStorage calls go through a small `src/lib/kvStore.ts` wrapper so testing can mock once. Three keys total: `@flexyug/today-snapshot/v1`, `@flexyug/rest-timer/v1` — no third for quarantine since that lives in SQLite.

**Test setup.** `jest.setup.js` already mocks `@react-native-async-storage/async-storage` to a stub. Tests that need real read/write behavior install an in-memory mock locally inside the test file.

**Sentry breadcrumbs.** Add breadcrumb entries for:
- Snapshot hydrate (success/failure)
- Quarantine retry / discard (audit trail)
- Rest timer restore decision

These help diagnose user-reported "I lost my workout" claims later.

### File-level changes summary

**New:**
- `src/components/numericStepper.ts` — extend with `useDebouncedCommit`
- `src/components/CollisionSheet.tsx`
- `src/components/QuarantineBanner.tsx`
- `src/components/QuarantineSheet.tsx`
- `src/lib/kvStore.ts` — thin AsyncStorage wrapper
- `src/ui/todaySnapshot.ts`
- `src/sync/quarantine.ts`
- `src/queries/activeWorkouts.ts` — collision detection query
- Tests for all of the above

**Modified:**
- `src/components/NumericStepperView.tsx` — wire debounce hook into keypad
- `src/screens/Today.tsx` — snapshot hydration, collision sheet, quarantine banner
- `src/ui/hooks/useRestTimer.ts` — persistence
- `app/_layout.tsx` — `hydrateSnapshot()` alongside `initDb()`
- `src/auth/AuthContext.tsx` (or sign-out path) — `clearSnapshot()` on sign-out
- `src/sync/engine.ts` — invalidate active-workout queries on pull complete (verify, possibly already happens)

**Untouched:**
- `src/db/*` (schema, mutations primitive, client)
- `src/sync/push.ts`, `src/sync/pull.ts`, `src/sync/state.ts` core logic
- All Phase 1 visual files (`ActiveSetCard`, `RepeatCard`, theme, motion, haptics, typography, colors)
- Non-Phase-1/2 screens (`History`, `HistoryDetail`, `Progress`, `Profile`, `TrainingPlan`)

## Alternatives considered

- **Per-keystroke autosave (no debounce).** Rejected — extra outbox volume for negligible safety benefit beyond 250ms.
- **Disk-mirror text buffer for the 250ms window.** Rejected as YAGNI — eliminates a 250ms window at the cost of an additional persistence path.
- **Auto-resolve collisions silently (newest wins, toast the rest).** Rejected — explicit choice respects the user's agency; toast can be missed.
- **Auto-retry quarantined rows on a schedule.** Rejected — the user should consciously decide. Silent auto-retry can re-fail forever and the user never learns the real problem.
- **Snapshot the active workout too.** Deferred — the marginal benefit (instant cold-launch into an active workout) is real but adds a second snapshot path. Today screen handles the dominant cold-start case.

## Testing

**Unit (Jest):**
- `src/components/__tests__/numericStepper.test.ts` — extend with debounce hook tests using `jest.useFakeTimers()`
- `src/ui/__tests__/todaySnapshot.test.ts` — round-trip serialize, schema version mismatch, stale (>7d) discard
- `src/sync/__tests__/quarantine.test.ts` — query returns only attempts >= 5, retry resets attempts, discard removes
- `src/queries/__tests__/activeWorkouts.test.ts` — collision detection returns ≥2 only, set/exercise counts correct
- `src/ui/hooks/__tests__/useRestTimer.test.ts` — `shouldRestoreTimer` pure-policy: null in, schema mismatch, negative elapsed, beyond threshold, within threshold

**Integration:**
- `src/__tests__/phase-2-trust-e2e.test.ts` — covers: type "185" in keypad mode then crash before blur (autosave fires), sync a second workout from another device (collision detected), force 5 push failures (row quarantines, query surfaces it), start rest timer then "restart app" simulated (timer restores)

**Device (manual, captured in plan as a checklist):**
- Type in weight keypad, wait ~300ms, force-quit, relaunch → value present
- Cold launch Today → Repeat card appears instantly (before SQLite finishes)
- Manually insert a second unfinished workout via dev console, navigate to Today → CollisionSheet appears
- Use a SQL tool to bump an outbox row to `attempts = 5, created_at = 25h ago` → banner appears on Today
- Start a rest timer, background app for 30s, foreground → timer shows ~30s + drift

## Rollout

Single-developer, single-user app. No production traffic. No feature flag. Sequenced commit history, each commit gating on `npm run typecheck && npm run lint && npm test`:

1. **kvStore wrapper + Sentry breadcrumbs scaffolding** — foundation
2. **Debounced autosave** — pure logic + hook wire-in + tests
3. **Today snapshot module + tests**
4. **Today screen snapshot integration**
5. **Workout collision query + tests**
6. **CollisionSheet component**
7. **Today screen collision integration + post-pull invalidation hook**
8. **Quarantine module + tests**
9. **QuarantineBanner + QuarantineSheet components**
10. **Today screen quarantine integration**
11. **Rest timer pure-policy + tests**
12. **useRestTimer persistence wire-in**
13. **Sign-out clears all KV state**
14. **Spec status flip to `implemented`**

14 commits, each independently reviewable.

## Open questions

- **Does the existing post-pull invalidation cover collision detection?** Likely yes (each table's pull invalidates its own query keys), but the plan should include a verification step. If not, add `qc.invalidateQueries({ queryKey: queryKeys.workouts.all })` to `pullOnce`'s success path.
- **What language for the discard-collision confirmation?** Phase 2 keeps it minimal: per-row `Discard` button is direct; no confirmation step. The collision sheet itself is the deliberate moment. (If users start discarding by accident, add confirmation in Phase 4.)
- **What if `MAX_ATTEMPTS` is changed in the future?** The quarantine module imports it from `push.ts` — single source of truth. No drift.
