# Undo-Toast Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** docs/specs/2026-08-23-undo-toast-spec.md — delete-set and delete-workout become immediate + 10s-undoable; their confirm sheets go away. Finish/sign-out/leave-set confirms unchanged.

**Architecture:** T1 gives the write path id-capture + restore (db/queries, TDD). T2 grows the toast an action slot. T3 rewires the three call sites and retires the confirms. Scout findings (validated): push sends op:'delete' as a soft server-update and passes `{deleted_at: null}` updates unfiltered; outbox drains per-row FIFO (same-row delete precedes its restore); pull skips rows with ANY pending delete op so a mid-window pull can't re-tombstone; the local update branch has no deleted_at WHERE-filter, so restoring via op:'update' works; ToastProvider mounts above the navigator, so a toast survives router.back().

## Global Constraints

- All writes through `enqueueMutation` — restore is `op:'update'` with payload `{ deleted_at: null }` per captured row; NEVER re-derive membership after the fact (a set deleted last week must stay deleted when its workout is deleted-then-undone — capture at cascade time is the only correct source).
- `recomputeExercisePRs` after restore, per distinct exercise, best-effort (same idiom as delete).
- Toast: ONE surface (ToastContext) grows `{ actionLabel, onAction, holdMs }`; default behavior byte-compatible for existing callers; UNDO hold = 10_000ms; action press dismisses immediately then runs onAction; action label is an act-now moment → accent-colored, ≥44pt hit area, accessibilityRole="button". Reduce Motion continues to zero only fade durations. A newer toast still replaces an older one (accepted: rare; an undo lost to a replacing toast is a known edge, note in code).
- Confirm removals: EditSetSheet `confirmDelete` prop + its ConfirmSheet + `deleteConfirm` state DELETED (both mounts); HistoryDetail's delete-workout ConfirmSheet DELETED (ref-latch + loading stay). ConfirmSheet itself and all other confirms untouched.
- Copy: "Set deleted" / "Workout deleted", action "Undo" (match the app's terse voice; no exclamation, no 'successfully').
- Gates per commit (`npm run typecheck && npm test && npm run lint && npm run format:check`, 0 lint errors, explain warning deltas); conventional commits; push at end of T3 + CI watch; spec status flips draft → implemented in T3.

---

### Task 1: Capture + restore + orchestration (TDD)

**Files:** Modify src/db/mutations.ts, src/queries/workouts.ts, src/queries/sets.ts; extend src/queries/**tests**/workoutsQueries.test.ts + src/queries/**tests**/sets.test.ts (+ mutations tests if a dedicated file exists).

**Interfaces (contracts for T3):**

- `enqueueMutation(...): Promise<TombstonedRow[]>` where `TombstonedRow = { table: SyncedTable; id: string }` — non-empty ONLY for op:'delete' (parent first, then cascade order); all existing callers keep compiling (they ignore the value).
- `restoreRows(rows: TombstonedRow[]): Promise<void>` in mutations.ts — per row `enqueueMutation({ table, op:'update', rowId: id, payload: { deleted_at: null } })`.
- `deleteWorkoutAndRecompute(userId, workoutId, exerciseIds): Promise<TombstonedRow[]>` (was void).
- `undoWorkoutDelete(userId: string, rows: TombstonedRow[], exerciseIds: string[]): Promise<void>` in workouts.ts — restoreRows then best-effort per-exercise recompute.
- `deleteSet(setId): Promise<TombstonedRow[]>`; `useDeleteSet`'s mutation resolves those rows (invalidation unchanged).

- [ ] TDD: (1) delete a workout with 2 exercises / 3 sets where ONE set was tombstoned beforehand → capture contains workout + 2 we + 2 sets, NOT the pre-deleted set; (2) `restoreRows` on that capture clears deleted_at on exactly those rows (pre-deleted set stays deleted) and enqueues one update outbox row per restored row with `deleted_at: null` payload, AFTER the delete rows for the same row_id (assert outbox order per row); (3) delete→undo round trip: `getGroupedPRs` shows the PR again after `undoWorkoutDelete`; (4) `deleteSet` returns `[{table:'sets', id}]` and restore brings the set back.
- [ ] Implement: cascadeSoftDelete accumulates `{table,id}` as it walks (inside the existing tx); enqueueMutation returns capture; restoreRows loops enqueueMutation (each its own tx — note partial-restore-on-crash accepted in a comment); orchestration fns per contracts.
- [ ] Gates; commit `feat(undo): soft-delete captures its cascade; restore path re-enqueues through the outbox (undo spec §1)`.

### Task 2: Toast action slot

**Files:** Modify src/ui/ToastContext.tsx (+ a component/hook test if the repo's react-native testing-library harness supports it cleanly — authError.test.tsx is the precedent; otherwise pure-logic extraction + test, judgment documented).

- [ ] `showToast(message, kind?, opts?: { actionLabel?: string; onAction?: () => void; holdMs?: number })` — default path byte-compatible. Row layout: message Text (flex, numberOfLines 2) + action Pressable (accent-colored monoMedium label per act-now rule, minHeight/minWidth theme.touch.min, accessibilityRole button, accessibilityLabel = actionLabel + context). Action press: clear timers, dismiss (fast fade per Reduce Motion), then onAction(). holdMs threads into the withSequence delay.
- [ ] Gates; commit `feat(toast): action slot with configurable hold (undo spec §2)`.

### Task 3: Rewire call sites, retire confirms, ship

**Files:** Modify src/components/EditSetSheet.tsx, src/screens/HistoryDetail.tsx, src/screens/WorkoutActive.tsx (only if its EditSetSheet mount needs prop cleanup), docs/specs/2026-08-23-undo-toast-spec.md (status → implemented + validated-answers note).

- [ ] EditSetSheet: confirmDelete/ConfirmSheet/deleteConfirm deleted; handleDelete deletes immediately (ref latch stays), onSuccess: recompute + invalidations as today + onClose + `showToast('Set deleted', 'info', { actionLabel:'Undo', onAction })` where onAction restores via restoreRows + recomputeExercisePRs + the same invalidations (closure captures userId/exerciseId/weId; undo errors surface via the existing error toast path).
- [ ] HistoryDetail: ConfirmSheet + deleteConfirm deleted; Delete button fires onDeleteWorkout directly (latch + loading stay); capture rows → `router.back()` → `showToast('Workout deleted', 'info', { actionLabel:'Undo', onAction })` with onAction = undoWorkoutDelete + history/PR/workouts.all invalidations. Drop the now-dead `confirmDelete` prop from its EditSetSheet mount.
- [ ] Spec status flip + one-line answers to its open questions (from the scout: push passes deleted_at:null; per-row FIFO; pull guard).
- [ ] Full gates; commit `feat(undo): deletes are immediate and undoable; delete confirms retired (undo spec §3)`; add this plan file `docs: undo-toast plan (executed)`; push; `gh run watch` green.

## Verification limits

No tap injection on this host — toast/undo interaction rides on tests + the device-QA rider; controller does a boot smoke after the batch.
