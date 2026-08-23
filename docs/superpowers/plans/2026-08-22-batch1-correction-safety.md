# Batch 1: Correction & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement docs/specs/2026-08-22-history-correction-spec.md — per-set edit/delete + delete-workout in HistoryDetail, destructive-only confirms on Finish and Sign out.

**Architecture:** All writes flow through the existing `enqueueMutation` outbox path (cascade soft-delete already handles workouts→exercises→sets). Task 1 adds the pure/query-layer pieces with tests; Task 2 wires HistoryDetail + EditSetSheet; Task 3 adds the two conditional confirms. No new write primitives.

**Tech Stack:** React Native/Expo, TanStack Query, expo-sqlite (better-sqlite3 mock in jest), existing ui primitives (Sheet/ConfirmSheet/Button/Plate).

## Global Constraints

- Spec: docs/specs/2026-08-22-history-correction-spec.md — decisions there are settled; do not re-litigate.
- Every mutation goes through existing paths: `enqueueMutation`, `deleteWorkoutLocal`, `updateSet`/`deleteSet`, `recomputeExercisePRs` (serialized, per-exercise — never `recomputeAllPRs` in a hot path).
- Confirms use the existing `ConfirmSheet` (src/ui/ConfirmSheet.tsx props: visible/onClose/title/message?/confirmLabel/cancelLabel?/destructive?/onConfirm). Copy is product language: name the action and the cost, no "Are you sure?".
- Volt accent rules: history is a record — corrections UI uses ink/danger tones, never accent.
- Conventional commits; all four gates green before each commit (`npm run typecheck && npm test && npm run lint && npm run format:check`).
- TDD for Task 1's pure/query functions. UI tasks: full suite green + self-review; no RN component snapshot tests (repo has none for screens).
- Match each file's comment idiom (short, spec-referencing). Reference the spec as `(spec 2026-08-22 §N)`.

---

### Task 1: Pure helpers + query-layer orchestration (TDD)

**Files:**

- Modify: `src/components/activeSet.ts` (add `setRowToShape`, `countIncompleteSets`)
- Modify: `src/sync/outboxPreview.ts` (add `getOutboxCount`)
- Modify: `src/queries/workouts.ts` (add `deleteWorkoutAndRecompute`)
- Tests: extend `src/components/__tests__/activeSet.test.ts` (or the existing activeSet test file — find it with `ls src/components/__tests__/`), extend `src/queries/__tests__/workoutsQueries.test.ts`, create `src/sync/__tests__/outboxCount.test.ts`

**Interfaces:**

- Produces (Task 2/3 depend on these exact signatures):
  - `setRowToShape(s: Set): SetShape` — maps DB row (`workout_exercise_id`/`order_index`/`completed`) to the sheet's shape (`weId`/`orderIndex`/`completed`). DB type: `Set` from `@/db/types` (aliased `SetRow` in some files).
  - `countIncompleteSets(exercises: ExerciseShape[]): number` — sets with `completed === false`.
  - `getOutboxCount(): Promise<number>` — `SELECT COUNT(*) FROM outbox WHERE attempts < MAX_ATTEMPTS`.
  - `deleteWorkoutAndRecompute(userId: string, workoutId: string, exerciseIds: string[]): Promise<void>` — `deleteWorkoutLocal(workoutId)` then `recomputeExercisePRs(userId, id)` for each distinct id (best-effort per exercise: wrap each in try/catch + `reportError` like finishWorkout's PR block).

- [ ] **Step 1: Write failing tests.** In the activeSet test file add:

```ts
describe('setRowToShape', () => {
  it('maps DB row fields to sheet shape', () => {
    const shape = setRowToShape({
      id: 's1',
      workout_exercise_id: 'we1',
      order_index: 2,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: true,
    } as never);
    expect(shape).toEqual({
      id: 's1',
      weId: 'we1',
      orderIndex: 2,
      weight: 80,
      reps: 5,
      units: 'kg',
      completed: true,
    });
  });
});

describe('countIncompleteSets', () => {
  it('counts only incomplete sets across exercises', () => {
    const ex = (sets: Partial<SetShape>[]): ExerciseShape =>
      ({ id: 'we', exerciseId: 'e', exerciseName: 'X', orderIndex: 0, sets }) as never;
    expect(
      countIncompleteSets([
        ex([{ completed: true }, { completed: false }]),
        ex([{ completed: false }]),
      ]),
    ).toBe(2);
    expect(countIncompleteSets([ex([{ completed: true }])])).toBe(0);
    expect(countIncompleteSets([])).toBe(0);
  });
});
```

In `src/sync/__tests__/outboxCount.test.ts`: follow the db-harness idiom used by `src/queries/__tests__/sets.test.ts` (jest maps expo-sqlite → better-sqlite3 mock; look at that file's setup/beforeEach). Seed the outbox by calling an existing enqueue path (e.g. `enqueueMutation` twice) and assert `getOutboxCount()` resolves 2; then assert 0 on a fresh/empty db. Also assert rows with `attempts >= MAX_ATTEMPTS` (UPDATE the row directly via getDb) are excluded.

In `workoutsQueries.test.ts` add a `deleteWorkoutAndRecompute` describe: seed a finished workout with one completed set (copy the existing `deleteWorkoutLocal` describe's seeding), assert after the call (a) the workout row has `deleted_at` set and cascade reached the set, (b) the exercise's `heaviest_weight` PR row reflects the deletion (down-written or removed — assert via the same query the existing personalRecords tests use).

- [ ] **Step 2: Run the new tests, confirm they fail** (missing exports).

- [ ] **Step 3: Implement.** In `activeSet.ts` (near SetShape):

```ts
import type { Set as SetRow } from '@/db/types';

/** DB row → sheet shape (HistoryDetail reuses EditSetSheet, spec 2026-08-22 §1). */
export function setRowToShape(s: SetRow): SetShape {
  return {
    id: s.id,
    weId: s.workout_exercise_id,
    orderIndex: s.order_index,
    weight: s.weight,
    reps: s.reps,
    units: s.units,
    completed: s.completed,
  };
}

/** Incomplete sets a Finish would prune (confirm gate, spec 2026-08-22 §3). */
export function countIncompleteSets(exercises: ExerciseShape[]): number {
  return exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.completed).length, 0);
}
```

(Verify the actual DB type name/import in `src/db/types.ts` first; `completed` may be stored 0/1 — coerce with `!!` if the existing detail query returns numbers. Check how `HistoryDetail` reads `s.completed` today and mirror it.)

In `outboxPreview.ts`:

```ts
/** Pending-outbox count at call time (sign-out gate, spec 2026-08-22 §4). */
export async function getOutboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE attempts < ?`,
    [MAX_ATTEMPTS],
  );
  return row?.n ?? 0;
}
```

In `workouts.ts` (near `deleteWorkoutLocal`):

```ts
/**
 * Delete a finished workout and recompute records for every exercise it
 * touched (spec 2026-08-22 §2). Recompute is best-effort per exercise —
 * a records hiccup must never resurrect the workout.
 */
export async function deleteWorkoutAndRecompute(
  userId: string,
  workoutId: string,
  exerciseIds: string[],
): Promise<void> {
  await deleteWorkoutLocal(workoutId);
  for (const exerciseId of [...new Set(exerciseIds)]) {
    try {
      await recomputeExercisePRs(userId, exerciseId);
    } catch (err) {
      reportError(err);
    }
  }
}
```

(Use the module's existing error-report import — finishWorkout's PR block shows the idiom.)

- [ ] **Step 4: Tests green, gates green, commit:** `feat(correction): pure helpers + delete-workout orchestration (spec 2026-08-22)`

---

### Task 2: HistoryDetail corrections UI

**Files:**

- Modify: `src/components/EditSetSheet.tsx` (add `confirmDelete?: boolean`; PR/history invalidation after recompute)
- Modify: `src/screens/HistoryDetail.tsx` (pressable set rows → EditSetSheet; Delete-workout button → ConfirmSheet → `deleteWorkoutAndRecompute`)

**Interfaces:**

- Consumes: `setRowToShape`, `deleteWorkoutAndRecompute` from Task 1; existing `EditSetSheet` props; `ConfirmSheet`; `useAuth` (src/auth/useAuth), `useProfile` (find its home via WorkoutActive.tsx's imports — copy that usage for userId/units/weightStep/weightUnit).

- [ ] **Step 1: EditSetSheet `confirmDelete`.** Add to Props: `/** Gate Delete behind a confirm — finished sets are records (spec 2026-08-22 §1). */ confirmDelete?: boolean;`. Add state `const [deleteConfirm, setDeleteConfirm] = useState(false);`. Delete button `onPress={() => (confirmDelete ? setDeleteConfirm(true) : handleDelete())}`. Render after the existing content:

```tsx
<ConfirmSheet
  visible={deleteConfirm}
  onClose={() => setDeleteConfirm(false)}
  title={`Delete set ${setNumber}?`}
  message="Removes it from this workout and recomputes records."
  confirmLabel="Delete set"
  destructive
  onConfirm={handleDelete}
/>
```

Nested-sheet check: ConfirmSheet mounts its own Modal; verify (in code) `Sheet` supports a sibling modal while the edit sheet is open — `WorkoutActive` already stacks sheets (picker + confirm); mirror whatever ordering it uses. Also in this file: after `recompute()` add invalidation so Progress/History refresh (`useQueryClient`; invalidate `queryKeys.personalRecords(userId)` and `queryKeys.history(userId)`), keeping the existing fire-and-forget style.

- [ ] **Step 2: HistoryDetail wiring.** Add `useAuth`/`useProfile` (mirror WorkoutActive's destructuring for `userId`, `units`, `weightStep`, `weightUnit`). Add state:

```ts
const [editTarget, setEditTarget] = useState<{
  set: SetShape;
  setNumber: number;
  exerciseId: string;
  exerciseName: string;
} | null>(null);
const [deleteConfirm, setDeleteConfirm] = useState(false);
```

Wrap each set row's inner content in a `Pressable` (keep the row Views' styles; add `accessibilityRole="button"` and `accessibilityLabel={`Edit set ${idx + 1}, ${we.exercise?.name ?? 'exercise'}`}`, `hitSlop` to honor the 44pt floor if the row is shorter) that sets `editTarget` via `setRowToShape(s)`. Skip rows whose `we.exercise` is null (no exerciseId → no recompute target): render those rows as today, un-pressable.

Below the exercise blocks add the delete affordance:

```tsx
<Button
  label="Delete workout"
  kind="danger"
  size="row"
  onPress={() => setDeleteConfirm(true)}
  accessibilityLabel="Delete this workout"
  accessibilityHint="Removes it from history and recomputes records"
  style={styles.deleteBtn}
/>
```

(`deleteBtn`: top margin `theme.space.section`; follow Profile's sign-out button styling for placement idiom.) Render, guarded by `userId`:

```tsx
{
  editTarget && userId ? (
    <EditSetSheet
      visible
      set={editTarget.set}
      setNumber={editTarget.setNumber}
      exerciseName={editTarget.exerciseName}
      exerciseId={editTarget.exerciseId}
      userId={userId}
      units={units}
      weightStep={weightStep}
      weightUnit={weightUnit}
      confirmDelete
      onClose={() => setEditTarget(null)}
    />
  ) : null;
}
<ConfirmSheet
  visible={deleteConfirm}
  onClose={() => setDeleteConfirm(false)}
  title="Delete workout?"
  message={`Removes ${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'} and their sets from history and records.`}
  confirmLabel="Delete workout"
  destructive
  onConfirm={onDeleteWorkout}
/>;
```

`onDeleteWorkout`: collect `exerciseIds = exercises.map((we) => we.exercise?.id).filter(Boolean)`, `await deleteWorkoutAndRecompute(userId, workout.id, exerciseIds)`, invalidate `queryKeys.history(userId)`, `queryKeys.personalRecords(userId)`, `queryKeys.workouts.all` (check exact key export in keys.ts), then `router.back()`. Handle the not-`visible`-prop mismatch: EditSetSheet's `visible` prop — pass `visible={!!editTarget}` and keep the sheet mounted with last target if that's the repo's sheet-presence idiom (see sheetPresence.ts usage in WorkoutActive) — mirror WorkoutActive's EditSetSheet mounting exactly.

- [ ] **Step 3: A11y + craft pass.** VoiceOver labels on new controls; pressed-state feedback on rows (Pressable style fn with `theme.color` pressed tone — copy History.tsx's row Pressable pattern); no volt anywhere in this screen.

- [ ] **Step 4: Gates green, commit:** `feat(correction): edit/delete sets and delete workout from HistoryDetail (spec 2026-08-22)`

---

### Task 3: Conditional confirms — Finish and Sign out

**Files:**

- Modify: `src/screens/WorkoutActive.tsx` (recap Finish button)
- Modify: `src/screens/Profile.tsx` (sign-out handler)

**Interfaces:**

- Consumes: `countIncompleteSets` (Task 1), `getOutboxCount` (Task 1), `ConfirmSheet`.

- [ ] **Step 1: Finish confirm.** In the recap branch (`!cursor`), compute `const incomplete = countIncompleteSets(exercises);`. Add state `const [finishConfirm, setFinishConfirm] = useState(false);`. Finish button `onPress={() => (incomplete > 0 ? setFinishConfirm(true) : onFinish())}`. Add:

```tsx
<ConfirmSheet
  visible={finishConfirm}
  onClose={() => setFinishConfirm(false)}
  title="Finish workout?"
  message={`${incomplete} incomplete ${incomplete === 1 ? 'set' : 'sets'} will be discarded.`}
  confirmLabel="Finish"
  destructive
  onConfirm={onFinish}
/>
```

State/hooks must be declared unconditionally at component top (not inside the branch) — WorkoutActive has multiple early-return branches; follow its existing pattern for branch-specific state.

- [ ] **Step 2: Sign-out gate.** In Profile's `handleSignOut`, before calling `signOut()`: `const pending = await getOutboxCount();` — if `pending > 0`, stash it (`setPendingCount(pending)`) and open the confirm instead of signing out. Confirm sheet:

```tsx
<ConfirmSheet
  visible={pendingCount != null}
  onClose={() => setPendingCount(null)}
  title="Sign out?"
  message={`${pendingCount} unsynced ${pendingCount === 1 ? 'change' : 'changes'} will be lost.`}
  confirmLabel="Sign out anyway"
  destructive
  onConfirm={doSignOut}
/>
```

where `doSignOut` is the current body (setSigningOut/try/finally). Zero pending → `doSignOut()` directly (unchanged UX).

- [ ] **Step 3: Gates green, commit:** `feat(correction): finish and sign-out confirms only when destructive (spec 2026-08-22)`

- [ ] **Step 4: Push + CI** (`git push`, `gh run watch …`).

---

## Verification limits (state honestly in reports)

Simulator tap injection is broken on this host (no Legacy HID port on iOS 26 sims) — live QA is limited to launch screenshots. Correctness rides on the jest suites; interactive verification lands with the TestFlight device-QA rider.
