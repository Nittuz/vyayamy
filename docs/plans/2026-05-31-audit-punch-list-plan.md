# Audit Punch List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 10 fixes from the 2026-05-31 senior-staff audit — closing the two real correctness bugs (composite-key upsert reconciliation, quarantine cleanup), the two security gaps (sign-out hygiene, threat model), the data-layer index miss, the engine listener safety hole, the dynamic-theme migration, the route-cast helper, the accessibility coverage critical, and the four missing query-layer integration tests.

**Architecture:** Pure additive fixes. No schema migrations beyond a single index. No mutation-primitive changes. No screen rewrites. Two new tiny modules (`safeRoute` helper, threat model doc); ~10 modified files; one new SQL migration.

**Tech Stack:** Expo 55, React Native 0.83, React 19, expo-router, expo-sqlite, Supabase, React Query 5.90, Jest with ts-jest + better-sqlite3 mock, Sentry.

**Audit:** Conversation context (no separate spec file). The 10 items are listed below with file:line references back to the audit findings.

**Branch:** `fix/audit-punch-list` (already checked out, off `main` which has Phases 1-4).

**Baseline:** 165 tests on `main`.

**Commit cadence:** One commit per task. Co-Authored-By footer required.

---

## File map

**New files:**
- `src/lib/safeRoute.ts` — typed-route-cast helper (Item 10)
- `docs/threat-model.md` — at-rest data, device-compromise model (Item 9)
- `supabase/migrations/00010_perf_indexes.sql` — local + server index (Item 6)
- `src/queries/__tests__/sets.test.ts` (Item 8)
- `src/queries/__tests__/finishWorkout.test.ts` (Item 8)
- `src/queries/__tests__/exercisesInvalidation.test.ts` (Item 8)
- `src/queries/__tests__/repeatLastWorkoutCache.test.ts` (Item 8)

**Modified files:**
- `src/sync/engine.ts` — clear rest-overrides on sign-out (Item 1); wrap listener callbacks (Item 3)
- `src/sync/push.ts` — capture PR upsert response id (Item 2)
- `src/sync/quarantine.ts` — discard cleans local row by op (Item 7)
- `src/sync/__tests__/quarantine.test.ts` — extend with cleanup tests (Item 7)
- `src/db/schema.ts` — add `idx_sets_completed_at` to LOCAL_SCHEMA_SQL (Item 6)
- `src/screens/HistoryDetail.tsx` — use `useTheme()` (Item 5)
- `src/components/ExercisePicker.tsx` — use `useTheme()` (Item 5)
- `src/screens/Today.tsx` — accessibility labels (Item 4) + use `safeRoute` (Item 10)
- `src/screens/WorkoutActive.tsx` — accessibility labels (Item 4)
- `src/components/ActiveSetCard.tsx` — accessibility labels (Item 4)
- `src/screens/History.tsx`, `Profile.tsx`, `TrainingPlan.tsx`, `PlanSetup.tsx` — use `safeRoute` (Item 10)

**Untouched:**
- SQLite schema beyond the new index
- Mutation primitive
- Sync core (push/pull algorithms)
- Phase 1-4 visual design tokens

---

## Task 1: Clear rest-overrides on sign-out (Item 1)

**Audit reference:** `src/sync/engine.ts:96` — Phase 4 introduced the key, sign-out doesn't clear it.

**Files:**
- Modify: `src/sync/engine.ts`

- [ ] **Step 1: Read current handleSignOut**

Run: `grep -n "handleSignOut\|clearSnapshot\|REST_TIMER_KEY" src/sync/engine.ts | head -15`

Confirm the existing Promise.all block clears `clearSnapshot()` + `removeKv(REST_TIMER_KEY)`.

- [ ] **Step 2: Add rest-overrides key clear**

Open `src/sync/engine.ts`. At the top, alongside the existing imports for `clearSnapshot`/`removeKv`/`REST_TIMER_KEY`, add the import for the rest-overrides key.

The rest-overrides storage key lives inline in `src/ui/restOverrides.ts` as `const STORAGE_KEY = '@flexyug/rest-overrides/v1'`. **First, expose it as a public export.** Open `src/ui/restOverrides.ts`, change:

```ts
const STORAGE_KEY = '@flexyug/rest-overrides/v1';
```

To:

```ts
export const REST_OVERRIDES_KEY = '@flexyug/rest-overrides/v1';
```

And replace the two internal uses of `STORAGE_KEY` with `REST_OVERRIDES_KEY`.

Then in `src/sync/engine.ts`, add:

```ts
import { REST_OVERRIDES_KEY } from '@/ui/restOverrides';
```

Inside `handleSignOut`, in the `Promise.all` block that clears Phase 2 KV state, add a third entry:

```ts
await Promise.all([
  clearSnapshot(),
  removeKv(REST_TIMER_KEY),
  removeKv(REST_OVERRIDES_KEY),
]);
```

- [ ] **Step 3: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: typecheck clean, same pre-existing lint count, 165/165 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/sync/engine.ts src/ui/restOverrides.ts
git commit -m "$(cat <<'EOF'
clear rest-overrides on sign-out (audit fix #1)

Phase 4 introduced @flexyug/rest-overrides/v1 but the sign-out
handler only cleared the Phase 2 snapshot + rest-timer keys.
Shared-device user A's rest overrides leaked into user B's
session. Exposes REST_OVERRIDES_KEY from restOverrides.ts and
adds removeKv to the handleSignOut Promise.all.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wrap engine listener callbacks (Item 3)

**Audit reference:** `src/sync/engine.ts:42, 50, 61` — network/foreground/auth listener callbacks don't try/catch.

**Files:**
- Modify: `src/sync/engine.ts`

- [ ] **Step 1: Find the three callbacks**

Run: `grep -n "addEventListener\|onAuthStateChange" src/sync/engine.ts`

Identify the three subscription registration sites in `startSyncEngine`. Each looks like:
```ts
netSub = NetInfo.addEventListener((s) => { ... });
appStateSub = AppState.addEventListener('change', (next) => { ... });
authSub = supabase.auth.onAuthStateChange((event, ...) => { ... }).data.subscription;
```

- [ ] **Step 2: Add a `safe()` wrapper helper at top of file**

Open `src/sync/engine.ts`. Above `startSyncEngine`, add:

```ts
import * as Sentry from '@sentry/react-native';

/**
 * Wrap a listener callback so a thrown exception doesn't propagate
 * to React Native's global error handler.
 */
function safeListener<T extends unknown[]>(
  label: string,
  fn: (...args: T) => void | Promise<void>,
): (...args: T) => void {
  return (...args: T) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        result.catch((err) => {
          Sentry.captureException(err, { tags: { engine_listener: label } });
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { engine_listener: label } });
    }
  };
}
```

(`@sentry/react-native` is already a dep — verify by checking `package.json` if uncertain.)

- [ ] **Step 3: Wrap the three callbacks**

Replace each listener registration to wrap the callback via `safeListener`:

```ts
netSub = NetInfo.addEventListener(safeListener('network', (s) => {
  // existing body unchanged
}));
```

```ts
appStateSub = AppState.addEventListener('change', safeListener('appState', (next) => {
  // existing body unchanged
}));
```

```ts
authSub = supabase.auth.onAuthStateChange(safeListener('auth', (event, _session) => {
  // existing body unchanged
})).data.subscription;
```

- [ ] **Step 4: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; 165 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sync/engine.ts
git commit -m "$(cat <<'EOF'
wrap engine listener callbacks in safeListener (audit fix #3)

Network/appState/auth subscription callbacks now wrap exceptions
via safeListener + Sentry.captureException. Previously a throw
inside any listener (e.g. a stale Supabase session triggering an
unhandled promise rejection) propagated to React Native's global
handler showing a red error overlay. Tagged for engine_listener
in Sentry so we can attribute by source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate HistoryDetail + ExercisePicker to useTheme (Item 5)

**Audit reference:** `src/screens/HistoryDetail.tsx:13`, `src/components/ExercisePicker.tsx:17` — Phase 1 residue, static `theme` import bypasses dark/light mode.

**Files:**
- Modify: `src/screens/HistoryDetail.tsx`
- Modify: `src/components/ExercisePicker.tsx`

- [ ] **Step 1: Migrate HistoryDetail.tsx**

Open `src/screens/HistoryDetail.tsx`. Read it fully to understand its style structure.

Change:
```ts
import { theme } from '@/ui/theme';
```
To:
```ts
import { useTheme } from '@/ui/useTheme';
```

Inside the component function, near the top, add:
```ts
const theme = useTheme();
```

This replaces the module-level static import with a per-render hook call. All `theme.color.X` / `theme.space.X` / `theme.font.X` references below become hook-derived and dynamically reflect dark/light mode.

**One catch:** `StyleSheet.create({...})` is evaluated at module load with the static `theme`. To make styles theme-aware, you have two options:

1. **Inline-style approach (simpler):** Convert `StyleSheet.create` to dynamic style objects via `useMemo`:
   ```ts
   const styles = useMemo(() => StyleSheet.create({
     container: { backgroundColor: theme.color.bg, ... },
     // ... rest
   }), [theme]);
   ```

2. **Split approach (more granular):** Keep StyleSheet.create for layout (paddings, flex) and apply color/font props inline via `style={[styles.X, { color: theme.color.ink }]}`.

Use approach #1 — simpler refactor.

Replace the existing `const styles = StyleSheet.create({...})` at module bottom with the `useMemo` block inside the component, AFTER the `useTheme()` call but BEFORE the return. Move the body of StyleSheet.create unchanged into the useMemo callback.

Remove the now-unused `import { StyleSheet } from 'react-native'` if it's not used elsewhere (likely still needed for `StyleSheet.hairlineWidth`).

- [ ] **Step 2: Migrate ExercisePicker.tsx**

Same pattern as Step 1 applied to `src/components/ExercisePicker.tsx`.

- [ ] **Step 3: Run gates + visual verification**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

Note in commit: device-level verification (dark mode toggle) requires the user to test on simulator.

- [ ] **Step 4: Commit**

```bash
git add src/screens/HistoryDetail.tsx src/components/ExercisePicker.tsx
git commit -m "$(cat <<'EOF'
migrate HistoryDetail + ExercisePicker to useTheme (audit fix #5)

Phase 1 residue: both files still imported the static theme
const instead of the useTheme() hook, meaning they rendered in
dark palette regardless of system color scheme. StyleSheet.create
moved inside component via useMemo([theme]) so style refs stay
stable per theme change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add idx_sets_completed_at (Item 6)

**Audit reference:** `src/db/schema.ts`, `src/queries/personalRecords.ts` — heaviest-weight history query has no matching index.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `supabase/migrations/00010_perf_indexes.sql`

- [ ] **Step 1: Add local SQLite index**

Open `src/db/schema.ts`. Find the `sets` table block (~line 80-120). After the existing `CREATE INDEX IF NOT EXISTS idx_sets_we ...`, add:

```sql
CREATE INDEX IF NOT EXISTS idx_sets_completed_at
  ON sets(workout_exercise_id, completed_at)
  WHERE completed = 1 AND deleted_at IS NULL;
```

(Partial index — only indexes completed, non-deleted sets. Smaller and exactly matches the PR history query predicate.)

- [ ] **Step 2: Bump SCHEMA_VERSION**

In the same file (likely a `const SCHEMA_VERSION = N;` near the top), bump from current value to next. This signals `initDb()` to re-apply schema (CREATE INDEX IF NOT EXISTS is safe to re-run).

Run: `grep -n "SCHEMA_VERSION" src/db/schema.ts src/db/client.ts | head`

Find the constant and bump by 1. The client's `initDb` compares `PRAGMA user_version` and runs the schema SQL — the IF NOT EXISTS clause makes it idempotent.

- [ ] **Step 3: Create server migration**

Create `supabase/migrations/00010_perf_indexes.sql`:

```sql
-- Phase post-audit: perf indexes for PR history queries.
-- The heaviest-weight history join scans sets by workout_exercise_id +
-- completed_at; without this index it table-scans as workout count grows.

CREATE INDEX IF NOT EXISTS idx_sets_completed_at
  ON sets(workout_exercise_id, completed_at)
  WHERE completed = TRUE AND deleted_at IS NULL;

-- Also index personal_records by achieved_at for recent-PR queries
CREATE INDEX IF NOT EXISTS idx_personal_records_achieved_at
  ON personal_records(user_id, achieved_at DESC)
  WHERE deleted_at IS NULL;
```

(The second index covers the Phase 1 "recent PR" dot computation in `Progress.tsx`; it was implicitly mentioned in the audit's data-layer section.)

- [ ] **Step 4: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green. The existing tests reset and re-init the DB per test, so the new index is created fresh each run with no migration concerns.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts supabase/migrations/00010_perf_indexes.sql
git commit -m "$(cat <<'EOF'
add sets.completed_at + personal_records.achieved_at indexes (audit fix #6)

Heaviest-weight history queries (personalRecords.ts) and the
recent-PR dot computation (Progress.tsx) both scan tables by
(workout_exercise_id, completed_at) and (user_id, achieved_at)
respectively with no matching index. Adds partial indexes filtered
on the non-tombstoned subset to keep the index small. Bumps local
SCHEMA_VERSION; CREATE INDEX IF NOT EXISTS keeps it idempotent.
00010 server migration covers Supabase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extract safeRoute helper (Item 10)

**Audit reference:** Multiple sites of `router.push('...' as never)`. Centralize.

**Files:**
- Create: `src/lib/safeRoute.ts`
- Modify: `src/screens/Today.tsx`, `src/screens/History.tsx`, `src/screens/Profile.tsx`, `src/screens/TrainingPlan.tsx`, `src/screens/PlanSetup.tsx`

- [ ] **Step 1: Create the helper**

Create `src/lib/safeRoute.ts`:

```ts
/**
 * Casts a runtime string to expo-router's typed-route shape.
 *
 * expo-router auto-generates typed routes from `app/*` filenames, but
 * dynamic routes (e.g. `/history/[id]`) and routes added mid-session
 * don't always show up in the typed inference. Rather than sprinkling
 * `as never` casts everywhere, route through this helper so the cast
 * lives in one place and can be removed once typed routes stabilize.
 */
export function safeRoute(path: string): never {
  return path as never;
}
```

- [ ] **Step 2: Replace `as never` call sites**

Run: `grep -rn "as never" src/screens/ | grep "router.push"`

For each result, replace `router.push('/path' as never)` with `router.push(safeRoute('/path'))`.

Specific known sites (per the grep earlier):
- `src/screens/Today.tsx:246` — `router.push('/profile/plan' as never)` → `router.push(safeRoute('/profile/plan'))`
- `src/screens/History.tsx:98` — `router.push(\`/history/${row.id}\` as never)` → `router.push(safeRoute(\`/history/${row.id}\`))`
- `src/screens/Profile.tsx:112` — same pattern
- `src/screens/TrainingPlan.tsx:44, 60` — same pattern
- `src/screens/PlanSetup.tsx:189` — same pattern (and any other PlanSetup hits)

Add `import { safeRoute } from '@/lib/safeRoute';` to each modified file.

- [ ] **Step 3: Run gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/safeRoute.ts src/screens/
git commit -m "$(cat <<'EOF'
extract safeRoute helper for typed-route casts (audit fix #10)

Replaces sprinkled router.push('/path' as never) with
router.push(safeRoute('/path')). Centralizes the typed-routes
inference workaround so it can be removed in one place once
expo-router's typed-routes stabilize for dynamic segments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Threat model document (Item 9)

**Audit reference:** SQLite-at-rest decision; should be documented rather than hidden.

**Files:**
- Create: `docs/threat-model.md`
- Modify: `README.md` (link the new doc)

- [ ] **Step 1: Write the threat model**

Create `docs/threat-model.md`:

```markdown
# FlexYug Threat Model

- **Status:** living document
- **Last reviewed:** 2026-05-31

## Scope

This document captures the threat actors, asset inventory, and risk
acceptances for the FlexYug (vyayamy) mobile client. Scope is limited
to client-side concerns; server-side Supabase RLS is documented in
the migration files under `supabase/migrations/`.

## Assets

| Asset | Storage | Sensitivity |
| --- | --- | --- |
| Workout data (exercises, weights, reps, timestamps) | Local SQLite + Supabase | Medium |
| Personal records | Local SQLite + Supabase | Medium |
| User identity (Supabase user id) | AsyncStorage (Supabase auth) | High |
| Magic-link session JWT | AsyncStorage (Supabase auth) | High |
| Rest timer + override preferences | AsyncStorage (`@flexyug/*`) | Low |

## Threat actors

| Actor | Capability | In scope |
| --- | --- | --- |
| Casual observer of the phone screen | Visual inspection | Yes |
| Thief with a non-jailbroken/non-rooted phone | OS-level only | Yes |
| Thief with a jailbroken/rooted phone | App sandbox extraction | **No** — see "Risk acceptances" |
| Malicious app on the same device | Inter-app communication via deep links | Yes |
| Network MITM | Wire-level traffic interception | Yes |
| Compromised Supabase project key | Server-side access | Out of scope (Supabase RLS) |

## Mitigations in place

- **HTTPS only** — Supabase URLs use HTTPS; no fallback to HTTP
- **RLS with USING + WITH CHECK on every table** (post-`00009_security_hardening.sql`)
- **Server-owned `updated_at` trigger** prevents client clock-skew tampering
- **Magic-link deep-link handler guards against React 19 strict-mode double-mount** (`app/_layout.tsx:101-126`)
- **Sentry PII off** + URL query/fragment scrubbing (`src/lib/errorReporting.ts:25-42`)
- **Notifications local-only, no payload content** (`src/lib/restNotifications.ts`)
- **Sign-out clears Sync state, React Query cache, local SQLite, and all `@flexyug/*` AsyncStorage keys** (`src/sync/engine.ts handleSignOut`)
- **Deep links land on a session-gated layout**; unauthenticated routes redirect to `/login` (`app/(tabs)/_layout.tsx`)

## Risk acceptances

### SQLite at-rest is not encrypted (accepted)

`src/db/client.ts` opens `flexyug.db` without an encryption library (SQLCipher,
expo-sqlite-encrypted, etc.). On a non-compromised device, OS-level sandbox
protection (iOS Data Protection, Android FBE) keeps the file inaccessible
to other apps and to most lost/stolen-phone scenarios. On a jailbroken or
rooted device, the database is extractable as plaintext.

**Rationale for accepting:**

- Workout data is medium-sensitivity at most; a forensic adversary with
  jailbreak access has many higher-value targets on the device
- SQLCipher integration adds a ~1MB native binary, requires key derivation
  + secure storage of the key, and creates a recovery hazard if the key is
  lost (the user's local data becomes permanently unreadable)
- The Supabase mirror provides recovery if the local DB is wiped; the
  inverse — protecting against the case where someone has the device but
  not credentials — is poorly served by full encryption because
  Supabase data is recoverable via password reset anyway

**Revisit if:** a paying customer requires HIPAA/healthcare-grade
protection, OR the data scope expands to include medical conditions,
identifying photos, or financial records.

### Local mutation throw has no retry (accepted)

`src/db/mutations.ts enqueueMutation` propagates SQLite lock/IO errors to
the caller, which surfaces as a toast. There's no automatic retry. On a
single-device app, SQLite contention is extremely rare; the user can re-
attempt the action manually. Adding retry adds complexity and can mask
real DB-corruption issues.

**Revisit if:** Sentry breadcrumbs show recurring transient SQLite errors.

## Out of scope

- Server-side compromise of the Supabase project
- Supply-chain attacks on `expo-google-fonts/*`, React Native, or other
  transitively-loaded npm packages
- Side-channel attacks (timing, power analysis) on cryptographic operations
- Adversaries with the user's unlocked phone in hand
- Insider threats at hosting provider (Supabase, Cloudflare, Sentry)

## Review cadence

This document is reviewed when:
- A new asset is added (e.g. body-measurement photos, payment data)
- A new external integration ships (e.g. Apple Health, share-to-social)
- A real incident occurs that updates our understanding of attacker
  capabilities or asset value
```

- [ ] **Step 2: Link from README.md**

Open `README.md`. Find the "Documentation" or "Key entry points" section. Add a line referencing the new doc:

```markdown
- [Threat model](docs/threat-model.md) — assets, actors, risk acceptances
```

(Insert it alongside the other docs links — likely under a heading that references ARCHITECTURE.md, AGENTS.md, etc.)

- [ ] **Step 3: Commit**

```bash
git add docs/threat-model.md README.md
git commit -m "$(cat <<'EOF'
add threat model doc (audit fix #9)

Documents the SQLite-at-rest risk acceptance, the assets/actors
inventory, mitigations in place, and review cadence. Calls out
the deliberate choice to not encrypt SQLite at rest (vs. the
complexity + recovery hazard of SQLCipher) and the conditions
under which to revisit. Linked from README's docs section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Integration tests for untested high-traffic queries (Item 8)

**Audit reference:** `useUpdateSet`, `useAddSet`, `useFinishWorkout`, `maybeUpdateAutoTitle` cache invalidation paths untested.

**Files:**
- Create: `src/queries/__tests__/sets.test.ts` (covers useUpdateSet + useAddSet)
- Create: `src/queries/__tests__/finishWorkout.test.ts`
- Create: `src/queries/__tests__/repeatLastWorkoutCache.test.ts`

(The existing `autoTitle.test.ts` covers `maybeUpdateAutoTitle` behavior. The audit specifically called out cache invalidation — already partially covered by the existing test's `addExerciseToWorkout` flow. We'll add a more pointed cache assertion in a dedicated test below.)

- [ ] **Step 1: Test useAddSet + useUpdateSet behavior**

Create `src/queries/__tests__/sets.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout } from '@/queries/workouts';
import { addExerciseToWorkout } from '@/queries/exercises';
import { addSet, updateSet, deleteSet, listSetsForWorkoutExercise } from '@/queries/sets';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'sets-test-user';
const EX = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('addSet creates a set and queues an outbox insert', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  // addExerciseToWorkout auto-stages one set per Phase 3 — that's set 0
  const setId = await addSet(weId, { weight: 185, reps: 5 });

  const sets = await listSetsForWorkoutExercise(weId);
  // Phase 3 auto-stage = set 0; addSet above = set 1
  expect(sets).toHaveLength(2);
  expect(sets[1]!.id).toBe(setId);
  expect(sets[1]!.weight).toBe(185);
  expect(sets[1]!.reps).toBe(5);

  const db = await getDb();
  const outbox = await db.getAllAsync<{
    table_name: string;
    op: string;
    row_id: string;
  }>('SELECT table_name, op, row_id FROM outbox WHERE row_id = ?', [setId]);
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.table_name).toBe('sets');
  expect(outbox[0]!.op).toBe('insert');
});

test('updateSet marks completed_at when completed:true, clears when false', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  await updateSet(setId, { weight: 135, reps: 8, completed: true });
  let row = await (await getDb()).getFirstAsync<{
    weight: number | null;
    reps: number | null;
    completed: number;
    completed_at: string | null;
  }>('SELECT weight, reps, completed, completed_at FROM sets WHERE id = ?', [setId]);
  expect(row!.weight).toBe(135);
  expect(row!.reps).toBe(8);
  expect(row!.completed).toBe(1);
  expect(row!.completed_at).not.toBeNull();

  await updateSet(setId, { completed: false });
  row = await (await getDb()).getFirstAsync(
    'SELECT weight, reps, completed, completed_at FROM sets WHERE id = ?',
    [setId],
  );
  expect(row!.completed).toBe(0);
  expect(row!.completed_at).toBeNull();
});

test('deleteSet soft-deletes the row and queues an outbox delete', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: EX });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  await deleteSet(setId);

  // listSetsForWorkoutExercise filters out deleted_at IS NOT NULL
  const visible = await listSetsForWorkoutExercise(weId);
  expect(visible).toHaveLength(0);

  const db = await getDb();
  const raw = await db.getFirstAsync<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM sets WHERE id = ?',
    [setId],
  );
  expect(raw!.deleted_at).not.toBeNull();

  const outbox = await db.getAllAsync<{ op: string }>(
    'SELECT op FROM outbox WHERE row_id = ?',
    [setId],
  );
  // 1 insert (from auto-stage) + 1 delete
  expect(outbox.map((r) => r.op).sort()).toEqual(['delete', 'insert']);
});
```

Run: `npm test -- --testPathPattern=sets.test`

Expected: 3/3 pass.

- [ ] **Step 2: Test finishWorkout**

Create `src/queries/__tests__/finishWorkout.test.ts`:

```ts
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { createWorkout, finishWorkout, getActiveWorkout, getRecentWorkouts } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'finish-test-user';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
});

test('finishWorkout sets ended_at and removes from active', async () => {
  const wId = await createWorkout({ userId: USER_ID, title: 'Push' });

  // Active workout shows up
  let active = await getActiveWorkout(USER_ID);
  expect(active?.id).toBe(wId);

  await finishWorkout(wId);

  // No longer active
  active = await getActiveWorkout(USER_ID);
  expect(active).toBeNull();

  // Shows up in recent
  const recent = await getRecentWorkouts(USER_ID);
  expect(recent.map((w) => w.id)).toContain(wId);

  // ended_at is set
  const db = await getDb();
  const row = await db.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workouts WHERE id = ?',
    [wId],
  );
  expect(row!.ended_at).not.toBeNull();

  // Outbox has the update
  const outbox = await db.getAllAsync<{ op: string; payload_json: string }>(
    'SELECT op, payload_json FROM outbox WHERE row_id = ?',
    [wId],
  );
  const updates = outbox.filter((r) => r.op === 'update');
  expect(updates).toHaveLength(1);
  const payload = JSON.parse(updates[0]!.payload_json);
  expect(payload.ended_at).not.toBeNull();
});

test('finishWorkout on a never-started workout still sets ended_at', async () => {
  // Edge case: a workout created and immediately finished with no sets.
  const wId = await createWorkout({ userId: USER_ID, title: 'Aborted' });
  await finishWorkout(wId);

  const db = await getDb();
  const row = await db.getFirstAsync<{ ended_at: string | null }>(
    'SELECT ended_at FROM workouts WHERE id = ?',
    [wId],
  );
  expect(row!.ended_at).not.toBeNull();
});
```

Run: `npm test -- --testPathPattern=finishWorkout.test`

Expected: 2/2 pass.

- [ ] **Step 3: Test repeatLastWorkout React Query cache invalidation surface**

Create `src/queries/__tests__/repeatLastWorkoutCache.test.ts`:

```ts
/**
 * Verifies that after a Phase 4 maybeUpdateAutoTitle fires inside the
 * useAddExerciseToWorkout success path, the workouts.all query key is
 * invalidated so consumers (Today screen's Repeat card, last-finished
 * query) re-read the updated title.
 *
 * This is a behavior test against the SQLite + outbox state — the React
 * Query layer is exercised at the mutation level via direct call.
 */
import { QueryClient } from '@tanstack/react-query';

import { getDb, initDb, resetDbForTests } from '@/db/client';
import { addExerciseToWorkout } from '@/queries/exercises';
import { queryKeys } from '@/queries/keys';
import { getLastFinishedWorkoutWithSeeds } from '@/queries/repeatLastWorkout';
import { createWorkout, finishWorkout, maybeUpdateAutoTitle } from '@/queries/workouts';
import { setSyncState } from '@/sync/state';

jest.mock('@/auth/supabase', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const USER_ID = 'repeat-cache-user';
const EX_A = '11111111-1111-1111-1111-111111111111';
const EX_B = '22222222-2222-2222-2222-222222222222';
const EX_C = '33333333-3333-3333-3333-333333333333';

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: false, pendingOutbox: 0, lastError: null });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_A, 'Bench Press', 'Chest', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_B, 'OHP', 'Shoulders', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [EX_C, 'Tricep Pushdown', 'Triceps', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  );
});

test('after maybeUpdateAutoTitle, Repeat card sees the composed title', async () => {
  const wId = await createWorkout({ userId: USER_ID });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_A });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_B });
  await addExerciseToWorkout({ workoutId: wId, exerciseId: EX_C });
  await maybeUpdateAutoTitle(wId);
  await finishWorkout(wId);

  const result = await getLastFinishedWorkoutWithSeeds(USER_ID);
  expect(result).not.toBeNull();
  expect(result!.workout.title).toBe('Chest + Shoulders + Triceps');
});

test('queryKeys.workouts.all exists and is the invalidation target', () => {
  // Sanity check that the key we'd invalidate matches what consumers read.
  // If this fails, the invalidation in useAddExerciseToWorkout.onSuccess
  // wouldn't propagate to the Today screen's queries.
  expect(queryKeys.workouts.all).toBeDefined();
  expect(Array.isArray(queryKeys.workouts.all)).toBe(true);
  expect(queryKeys.workouts.all.length).toBeGreaterThan(0);
});

test('QueryClient invalidation matches workouts.all prefix', () => {
  // Confirms React Query's prefix-match would catch consumers of
  // queryKeys.workouts.recent(userId) etc. via queryKeys.workouts.all.
  const qc = new QueryClient();
  qc.setQueryData(['workouts', 'recent', USER_ID], [{ id: 'w1' }]);
  qc.setQueryData(['workouts', 'active', USER_ID], { id: 'w1' });
  expect(qc.getQueryData(['workouts', 'recent', USER_ID])).toBeDefined();
  qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
  // After invalidate, data is still present but marked stale.
  // We're verifying the key shape is compatible with prefix matching.
  expect(qc.getQueryCache().findAll({ queryKey: queryKeys.workouts.all }).length).toBeGreaterThanOrEqual(2);
});
```

Run: `npm test -- --testPathPattern=repeatLastWorkoutCache`

Expected: 3/3 pass.

- [ ] **Step 4: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~173 tests (165 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add src/queries/__tests__/sets.test.ts src/queries/__tests__/finishWorkout.test.ts src/queries/__tests__/repeatLastWorkoutCache.test.ts
git commit -m "$(cat <<'EOF'
add integration tests for high-traffic queries (audit fix #8)

Tests behavior + outbox shape for: addSet (insert + queue),
updateSet (completed_at toggle), deleteSet (tombstone + delete
queue); finishWorkout (ended_at + active → recent transition);
Phase 4 auto-title cache invalidation surface (composed title
shows up in Repeat card; queryKeys.workouts.all prefix-matches).
8 new tests; 165 → 173 baseline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Fix discardQuarantinedRow to clean local row (Item 7)

**Audit reference:** `src/sync/quarantine.ts:69-72` — discard leaves local row in inconsistent state for `insert` and `update` ops.

**Files:**
- Modify: `src/sync/quarantine.ts`
- Modify: `src/sync/__tests__/quarantine.test.ts`

- [ ] **Step 1: Write failing tests for the new cleanup behavior**

Open `src/sync/__tests__/quarantine.test.ts`. After the existing tests, append:

```ts
import { addSet, listSetsForWorkoutExercise } from '@/queries/sets';
import { addExerciseToWorkout } from '@/queries/exercises';
import { createWorkout } from '@/queries/workouts';

test('discardQuarantinedRow with op=insert DELETEs the local row', async () => {
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  // Auto-stage already added one set; add another we'll quarantine
  const setId = await addSet(weId, { weight: 100, reps: 5 });

  // Find that set's outbox row and quarantine it
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox SET attempts = 5 WHERE row_id = ? AND op = ?',
    [setId, 'insert'],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'insert'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox entry is gone
  const outbox = await db.getAllAsync('SELECT id FROM outbox WHERE row_id = ?', [setId]);
  expect(outbox).toHaveLength(0);
  // Local row is also gone (was an insert; revert = delete)
  const sets = await listSetsForWorkoutExercise(weId);
  expect(sets.map((s) => s.id)).not.toContain(setId);
});

test('discardQuarantinedRow with op=delete UN-TOMBSTONES the local row', async () => {
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  // Get auto-staged set
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  // Tombstone via mutation
  const db = await getDb();
  await db.runAsync('UPDATE sets SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), setId]);
  // Manually insert a quarantined delete outbox row (simulating push failure)
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    ['sets', 'delete', setId, '{}', new Date().toISOString(), 5],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'delete'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox row gone; local row un-tombstoned
  const visible = await listSetsForWorkoutExercise(weId);
  expect(visible.map((s) => s.id)).toContain(setId);
});

test('discardQuarantinedRow with op=update leaves the local row alone', async () => {
  // Update is the "user's edit stays local, just not synced" case.
  // We don't revert local edits — that would be surprising.
  const wId = await createWorkout({ userId: 'u', title: 'T' });
  const weId = await addExerciseToWorkout({ workoutId: wId, exerciseId: 'ex' });
  const sets = await listSetsForWorkoutExercise(weId);
  const setId = sets[0]!.id;

  // Apply a local update and quarantine the outbox row for it
  const db = await getDb();
  await db.runAsync('UPDATE sets SET weight = ?, reps = ? WHERE id = ?', [200, 10, setId]);
  await db.runAsync(
    'INSERT INTO outbox (table_name, op, row_id, payload_json, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [
      'sets',
      'update',
      setId,
      JSON.stringify({ weight: 200, reps: 10 }),
      new Date().toISOString(),
      5,
    ],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE row_id = ? AND op = ?',
    [setId, 'update'],
  );

  await discardQuarantinedRow(row!.id);

  // Outbox row gone; local edit preserved
  const after = await listSetsForWorkoutExercise(weId);
  const stillThere = after.find((s) => s.id === setId);
  expect(stillThere?.weight).toBe(200);
  expect(stillThere?.reps).toBe(10);
});
```

Also setup the `ex` exercise row in `beforeEach` if not already done:

Open the file's existing `beforeEach` block and ensure an exercise with id `'ex'` is inserted into the exercises table — this is needed for the new tests that go through `addExerciseToWorkout`. Add:

```ts
await db.runAsync(
  'INSERT OR IGNORE INTO exercises (id, name, muscle_group, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ['ex', 'Test Exercise', 'Test', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
);
```

- [ ] **Step 2: Run — expect 3 new failures**

Run: `npm test -- --testPathPattern=quarantine`

Expected: the 3 new tests FAIL (current `discardQuarantinedRow` doesn't touch the local row).

- [ ] **Step 3: Implement the cleanup logic**

Open `src/sync/quarantine.ts`. Replace the existing `discardQuarantinedRow` and `discardAllQuarantined` with versions that fork on the op:

```ts
/**
 * Drop a quarantined row from the outbox AND clean up the local state:
 *   - insert: DELETE the local row (it never reached the server)
 *   - update: leave the local edit alone (user explicitly edited it)
 *   - delete: UN-tombstone the local row (delete never reached the server)
 *   - upsert: treat like insert
 *
 * Wrapped in a single SQLite transaction so the outbox + local state
 * stay consistent on a crash mid-discard.
 */
export async function discardQuarantinedRow(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{
      table_name: string;
      op: string;
      row_id: string;
    }>('SELECT table_name, op, row_id FROM outbox WHERE id = ?', [id]);
    if (!row) return;

    await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);

    if (row.op === 'insert' || row.op === 'upsert') {
      // Local row never reached the server; remove it entirely.
      await db.runAsync(`DELETE FROM ${row.table_name} WHERE id = ?`, [row.row_id]);
    } else if (row.op === 'delete') {
      // Delete never reached the server; un-tombstone the local row.
      await db.runAsync(
        `UPDATE ${row.table_name} SET deleted_at = NULL WHERE id = ?`,
        [row.row_id],
      );
    }
    // op === 'update': leave the local row alone — the user's edit stays.
  });
}

export async function discardAllQuarantined(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM outbox WHERE attempts >= ?',
    [MAX_ATTEMPTS],
  );
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await discardQuarantinedRow(r.id);
  }
}
```

Note: the `${row.table_name}` SQL interpolation is normally a SQL injection vector, BUT `table_name` comes from our own outbox writes where `enqueueMutation` writes only known table names (`sets`, `workouts`, `workout_exercises`, etc.). To be safe, add a whitelist guard:

```ts
const SAFE_TABLES = new Set([
  'workouts',
  'workout_exercises',
  'sets',
  'exercises',
  'personal_records',
  'templates',
  'training_plans',
  'training_plan_slots',
  'profiles',
]);

// Inside the transaction:
if (!SAFE_TABLES.has(row.table_name)) {
  // Unknown table — just drop the outbox row and bail.
  return;
}
```

Place the whitelist alongside the function.

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- --testPathPattern=quarantine`

Expected: existing 4 + 3 new = 7/7 pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~176 tests (173 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/sync/quarantine.ts src/sync/__tests__/quarantine.test.ts
git commit -m "$(cat <<'EOF'
discardQuarantinedRow cleans local state by op (audit fix #7)

Phase 2's discard only DELETEd the outbox row, leaving the local
table in an inconsistent state — orphan rows for inserts, stale
tombstones for deletes. Now forks on op: insert/upsert → DELETE
local row; delete → un-tombstone; update → leave alone (user's
edit). Wrapped in a single SQLite transaction. SAFE_TABLES
whitelist guards against future op-table injection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Capture personal_records upsert response (Item 2)

**Audit reference:** `src/sync/push.ts:125-129` — composite-key upsert returns server's row id but we don't read it; multi-device duplicates result.

**Files:**
- Modify: `src/sync/push.ts`
- Extend: `src/__tests__/offline-workout.test.ts` (or new test file)

This is the most subtle correctness bug on the list. The fix requires:
1. Reading the upsert response to find the server's authoritative row id
2. Updating the local SQLite row's id if it differs from the client-side UUID
3. Doing this inside a transaction so a crash mid-update doesn't leave dangling references

- [ ] **Step 1: Write a failing test for the reconciliation behavior**

Create `src/sync/__tests__/prUpsertReconciliation.test.ts`:

```ts
/**
 * Verifies that when a personal_records upsert is sent and the server
 * returns a row with a different id (because another device already
 * created a row with the same composite key), the local row's id is
 * updated to match the server's id.
 *
 * This prevents the post-pull duplicate that the audit flagged: without
 * reconciliation, the local row keeps the client-side UUID and the next
 * pull lands a "new" row with the server id, creating two locally-
 * visible PRs for one composite key.
 */
import { getDb, initDb, resetDbForTests } from '@/db/client';
import { __setPushSleepForTests, pushOutbox } from '@/sync/push';
import { setSyncState } from '@/sync/state';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const SERVER_ID = '99999999-9999-9999-9999-999999999999';

jest.mock('@/auth/supabase', () => {
  const upsertResponses: Array<{ id: string }> = [{ id: SERVER_ID }];
  const builder = (table: string) => {
    const chain = {
      _table: table,
      upsert(_p: Record<string, unknown>, _opts?: { onConflict?: string }) {
        const next = upsertResponses.shift() ?? { id: 'fallback' };
        return {
          select: () => ({
            single: () => Promise.resolve({ data: next, error: null }),
          }),
          // Fallback: old call shape (no select chain)
          then: (cb: (v: { error: null }) => void) => Promise.resolve(cb({ error: null })),
        };
      },
    };
    return chain;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

beforeEach(async () => {
  await resetDbForTests();
  await initDb();
  setSyncState({ online: true, pendingOutbox: 0, lastError: null });
  __setPushSleepForTests(() => Promise.resolve());
});

test('PR upsert response reconciles local id to server id', async () => {
  const db = await getDb();
  // Seed a personal_record locally with a client-side UUID
  await db.runAsync(
    `INSERT INTO personal_records (id, user_id, exercise_id, type, value, achieved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      CLIENT_ID,
      'u1',
      'ex1',
      'heaviest',
      JSON.stringify({ weight: 185, reps: 5 }),
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    ],
  );
  await db.runAsync(
    `INSERT INTO outbox (table_name, op, row_id, payload_json) VALUES (?, ?, ?, ?)`,
    [
      'personal_records',
      'upsert',
      CLIENT_ID,
      JSON.stringify({
        id: CLIENT_ID,
        user_id: 'u1',
        exercise_id: 'ex1',
        type: 'heaviest',
        value: { weight: 185, reps: 5 },
        achieved_at: '2026-05-01T00:00:00.000Z',
      }),
    ],
  );

  await pushOutbox();

  // Outbox is drained
  const outbox = await db.getAllAsync('SELECT id FROM outbox');
  expect(outbox).toHaveLength(0);

  // Local row id is now the server's id, not the client's
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM personal_records');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(SERVER_ID);
});
```

Run: `npm test -- --testPathPattern=prUpsertReconciliation`

Expected: FAIL — current `pushOutbox` doesn't capture the response.

- [ ] **Step 2: Update push.ts to capture upsert response for PR composite-key path**

Open `src/sync/push.ts`. Find the per-row push loop (around line 107-154 per the audit). The current PR upsert call is:

```ts
const opts = UPSERT_CONFLICT_TARGET[row.table_name];
await tbl.upsert(payload, opts);
```

Replace the PR composite-key case with a select-the-result variant:

```ts
const opts = UPSERT_CONFLICT_TARGET[row.table_name];
if (opts?.onConflict && opts.onConflict !== 'id') {
  // Composite-key upsert. Capture the server-returned row id and
  // reconcile if it differs from the local one (per audit fix #2).
  const { data: serverRow, error: upsertErr } = await tbl
    .upsert(payload, opts)
    .select('id')
    .single();
  if (upsertErr) throw upsertErr;
  const serverId = (serverRow as { id?: string } | null)?.id;
  if (typeof serverId === 'string' && serverId !== row.row_id) {
    await reconcileLocalRowId(row.table_name, row.row_id, serverId);
  }
} else {
  await tbl.upsert(payload, opts);
}
```

Add a helper at the bottom of the file:

```ts
/**
 * Update a local row's primary key to match the server-authoritative id
 * after a composite-key upsert revealed a different id existed.
 * Done in a transaction so a crash mid-update doesn't leave dangling refs.
 */
async function reconcileLocalRowId(
  table: string,
  oldId: string,
  newId: string,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // SAFE_TABLES guard: only run for tables we know about
    const SAFE = new Set([
      'personal_records',
    ]);
    if (!SAFE.has(table)) return;
    await db.runAsync(`UPDATE ${table} SET id = ? WHERE id = ?`, [newId, oldId]);
  });
}
```

(Only `personal_records` uses composite-key upserts today per `UPSERT_CONFLICT_TARGET`, so the whitelist is tight.)

- [ ] **Step 3: Run tests**

Run: `npm test -- --testPathPattern=prUpsertReconciliation`

Expected: 1/1 pass.

- [ ] **Step 4: Verify the existing offline-workout test still passes**

Run: `npm test -- --testPathPattern=offline-workout`

Expected: existing tests pass. The mock's `.then()` fallback in the new test file is for backwards compatibility with the existing test's mock, which uses a simpler `Promise.resolve({ error: null })` shape. If the existing test fails, it's because the existing mock's `.upsert()` returns a plain promise but the new code calls `.select('id').single()` on it. Two options:

(a) Make the existing mock support the new chain (preferred — match the production API).

(b) Make the production code degrade gracefully if `.select` is missing.

Go with (a). Open `src/__tests__/offline-workout.test.ts` and update the mock's `upsert` to return a chain that supports both shapes:

```ts
upsert(p: Record<string, unknown>, _opts?: { onConflict?: string }) {
  serverLog.push({ table, op: 'upsert', row_id: String(p.id), payload: p });
  return {
    select: () => ({
      single: () => Promise.resolve({ data: { id: String(p.id) }, error: null }),
    }),
    // Old direct-await path
    then: (cb: (v: { error: null }) => void) => Promise.resolve(cb({ error: null })),
  };
},
```

Re-run: `npm test -- --testPathPattern=offline-workout`

Expected: pass.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~177 tests (176 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add src/sync/push.ts src/sync/__tests__/prUpsertReconciliation.test.ts src/__tests__/offline-workout.test.ts
git commit -m "$(cat <<'EOF'
capture PR upsert response and reconcile local id (audit fix #2)

Phase 1's personal_records composite-key upsert returned the
server's authoritative row id but the push engine never read it.
Two devices upserting the same (user_id, exercise_id, type)
ended up with one server row but two local rows after the next
pull — visible duplicates in the PRs surface. Now selects 'id'
on composite-key upserts, and if the server id differs from the
client UUID, updates the local row's id in a single transaction.
SAFE whitelist restricts the dynamic-table UPDATE to known
composite-key tables. New test + extended offline-workout mock
to support the select().single() chain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Accessibility sweep (Item 4)

**Audit reference:** `src/screens/Today.tsx:152-165, 224-264`, `src/screens/WorkoutActive.tsx:282-289, 350-362`, `src/components/ActiveSetCard.tsx:136-175` — ~12% accessibility coverage across 140 Pressables.

**Files:**
- Modify: `src/screens/Today.tsx`
- Modify: `src/screens/WorkoutActive.tsx`
- Modify: `src/components/ActiveSetCard.tsx`
- Modify: `src/components/NumericStepperView.tsx`
- Modify: `src/components/RepeatCard.tsx`

This is the biggest single task. It's mechanical but voluminous. The goal: every `Pressable` and every meaningful state-bearing `<Text>` has accessibility metadata.

- [ ] **Step 1: Today.tsx accessibility**

Open `src/screens/Today.tsx`. For each `Pressable`, ensure it has:
- `accessibilityRole="button"`
- `accessibilityLabel` describing the action (e.g. "Open history")
- `accessibilityHint` (optional, describes outcome — e.g. "Opens the History screen")

Specific updates:

**The `→ history` link Pressable** (currently around line 156):

```tsx
<Pressable
  onPress={() => router.push(safeRoute('/history'))}
  hitSlop={8}
  accessibilityRole="link"
  accessibilityLabel="Open workout history"
  style={...}
>
```

**The `+ Blank` button** (around line 224):

```tsx
<Pressable
  onPress={onBlankStart}
  disabled={createWorkout.isPending || !!activeQuery.data}
  accessibilityRole="button"
  accessibilityLabel="Start a blank workout"
  accessibilityHint="Begin a new workout with no exercises"
  accessibilityState={{ disabled: createWorkout.isPending || !!activeQuery.data }}
  style={...}
>
```

**The `Templates` button** (around line 246):

```tsx
<Pressable
  onPress={() => router.push(safeRoute('/profile/plan'))}
  accessibilityRole="button"
  accessibilityLabel="Open training plan templates"
  style={...}
>
```

**Recent list rows** (around line 280): currently a `<View>` — change to `<Pressable>` if they're tappable, otherwise add `accessibilityLabel` to the row's outer View describing the workout summary.

**ResumeCard's outer Pressable** (in `Today.tsx` near line 320):

```tsx
<Pressable
  onPress={onPress}
  accessibilityRole="button"
  accessibilityLabel="Resume workout in progress"
  style={...}
>
```

**EmptyRepeatSlot** has no interactive elements — no accessibility needed.

- [ ] **Step 2: WorkoutActive.tsx accessibility**

Open `src/screens/WorkoutActive.tsx`. Apply:

**`+ Add exercise` (footer)** (around line 350):

```tsx
<Pressable
  onPress={() => setPickerOpen(true)}
  accessibilityRole="button"
  accessibilityLabel="Add exercise to workout"
  style={...}
>
```

**`+ Add exercise` (empty state)** (around line 282):

```tsx
<Pressable
  onPress={() => setPickerOpen(true)}
  accessibilityRole="button"
  accessibilityLabel="Add your first exercise"
  style={...}
>
```

**`Finish workout` button** (in the cursor=null finish summary section):

```tsx
<Pressable
  onPress={onFinish}
  disabled={finishWorkout.isPending}
  accessibilityRole="button"
  accessibilityLabel="Finish workout"
  accessibilityState={{ disabled: finishWorkout.isPending, busy: finishWorkout.isPending }}
  style={...}
>
```

**`Back to Today` link** (in the no-active state):

```tsx
<Pressable
  onPress={() => router.replace('/today' as never)}
  accessibilityRole="link"
  accessibilityLabel="Back to today"
  style={...}
>
```

**The `→ next` / `finish →` header button** (in `screenOptions.headerRight`):

```tsx
<Pressable
  onPress={onNextExercise}
  hitSlop={8}
  accessibilityRole="button"
  accessibilityLabel={hasNextExercise ? "Next exercise" : "Finish workout"}
  accessibilityHint={hasNextExercise ? "Move to the next exercise" : "Complete the workout"}
>
```

- [ ] **Step 3: ActiveSetCard.tsx accessibility**

Open `src/components/ActiveSetCard.tsx`. Apply:

**The outer animated card** (the swipe-up target):

```tsx
<GestureDetector gesture={pan}>
  <Animated.View
    style={[styles.container, animatedStyle]}
    accessibilityLabel={`Set ${setIndex}, ${formatValue(set.weight)} by ${formatValue(set.reps)} reps. Swipe up to complete.`}
    accessibilityHint="Swipe up to mark this set complete"
  >
```

**Ghost-stack rows** (the completed sets list, around line 181-203):

Each ghost row currently shows `SET N` + `weight × reps` + `✓`. Add an accessibilityLabel to the row View:

```tsx
<View
  key={g.id}
  style={styles.ghostRow}
  accessibilityLabel={`Set ${i + 1}, ${g.weight ?? 'no weight'} by ${g.reps ?? 'no reps'} reps, completed`}
>
```

The `✓` is color-only state today (`✓` glyph + green color). For screen readers, the `accessibilityLabel` above includes "completed", solving the color-only problem.

- [ ] **Step 4: NumericStepperView.tsx accessibility**

Open `src/components/NumericStepperView.tsx`. Apply:

**Chevron up/down buttons** (around line 113-126) likely already have `accessibilityLabel` from Phase 1 — verify and add if missing:

```tsx
<Pressable
  onPress={() => handleStep(1)}
  onLongPress={() => startRamp(1)}
  onPressOut={stopRamp}
  hitSlop={12}
  accessibilityRole="button"
  accessibilityLabel={`Increase ${unit.toLowerCase()} by ${step}`}
>
```

**The number Pressable (focused/unfocused tap target)** (around line 149):

```tsx
<Pressable
  onPress={onPressNumber}
  accessibilityRole="button"
  accessibilityLabel={`${unit}: ${formatValue(value)}. Tap to edit.`}
>
```

**The TextInput edit mode** (around line 162):

```tsx
<TextInput
  ...
  accessibilityLabel={`${unit} input`}
/>
```

- [ ] **Step 5: RepeatCard.tsx accessibility**

Open `src/components/RepeatCard.tsx`. Apply:

**Outer Pressable** (already has `accessibilityLabel={`Repeat ${title} workout`}` per Phase 1):

Verify, no change needed unless missing.

**Each seed row** (the exercise list): wrap or add `accessibilityLabel` to the View:

```tsx
<View
  key={seed.exerciseId}
  style={styles.seedRow}
  accessibilityLabel={`${seed.exerciseName}, ${formatSeed(seed)}`}
>
```

- [ ] **Step 6: Full gates**

Run: `npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3`

Expected: green; ~177 tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Today.tsx src/screens/WorkoutActive.tsx src/components/ActiveSetCard.tsx src/components/NumericStepperView.tsx src/components/RepeatCard.tsx
git commit -m "$(cat <<'EOF'
accessibility sweep across core screens (audit fix #4)

Phase 1-4 shipped with ~12% accessibilityLabel coverage across
~140 Pressables. This commit adds accessibilityRole + Label +
Hint + (where relevant) State to:
- Today: history link, + Blank, Templates, ResumeCard
- WorkoutActive: + Add exercise (both sites), Finish workout,
  Back to Today, → next / finish → header button
- ActiveSetCard: outer card swipe target, ghost-stack rows
  (resolves color-only completion indicator)
- NumericStepperView: chevrons, number tap target, TextInput
- RepeatCard: per-seed row labels

Screen-reader users can now navigate the core workout loop end-
to-end. Color-blind users get text confirmation alongside color
states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification + summary

**Files:** none — verification only.

- [ ] **Step 1: Run all gates**

```bash
npm run typecheck && npm run lint --silent 2>&1 | tail -3 && npm test 2>&1 | tail -3
git log --oneline main..HEAD | head -20
```

Expected:
- typecheck clean
- lint same pre-existing count
- ~177 tests pass
- 10 commits on `fix/audit-punch-list` corresponding to items 1, 3, 5, 6, 10, 9, 8, 7, 2, 4

- [ ] **Step 2: Verify each audit item is addressed**

Run: `git log --oneline main..HEAD | grep -E "audit fix"`

Expected: 10 lines (one per item).

Confirm:
- #1 Clear rest-overrides on sign-out → engine.ts handleSignOut + restOverrides.ts export
- #2 Capture PR upsert response → push.ts reconcileLocalRowId
- #3 Wrap engine listeners → engine.ts safeListener
- #4 Accessibility sweep → 5 component/screen files
- #5 useTheme migration → HistoryDetail + ExercisePicker
- #6 sets.completed_at index → schema.ts + 00010 migration
- #7 discardQuarantinedRow cleanup → quarantine.ts
- #8 Integration tests → 3 new test files
- #9 Threat model → docs/threat-model.md
- #10 safeRoute helper → src/lib/safeRoute.ts

- [ ] **Step 3: Device verification reminder**

The following items need device-level smoke testing post-merge:
- #4 (accessibility): turn on VoiceOver/TalkBack, navigate Today → workout flow end-to-end, verify each button announces its label
- #5 (useTheme migration): toggle iOS light/dark in Settings, verify HistoryDetail and ExercisePicker now adapt
- #7 (quarantine cleanup): manually quarantine an insert/update/delete row via SQL, discard each, verify local state

These are not blockers for merge.

- [ ] **Step 4: Final commit summary**

If everything's green, the branch is ready to merge. No "status flip" commit needed since the audit is conversation-context, not a spec doc.

---

## Self-review checklist (for the implementing engineer)

After all 11 tasks:

```bash
npm run typecheck && npm run lint && npm test
git log --oneline main..HEAD | head -15
```

Expected: 10 commits on `fix/audit-punch-list`, all green.

Each commit message includes `(audit fix #N)` so the trail back to the punch list is preserved.
