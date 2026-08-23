# Post-finish correction + friction realignment (Impeccable Batch 1)

- Date: 2026-08-22
- Status: approved (user directed via 2026-08-22 Impeccable critique Q&A: "Correction & safety" first, full scope)
- Source: Impeccable critique P0 "No correction path after Finish", P0-adjacent confirm gaps (Finish, Sign out)

## Problem

Finished workouts are permanent: HistoryDetail is read-only, EditSetSheet only mounts from
WorkoutActive, and a fat-fingered `300 × 6` becomes the user's all-time PR, chart ceiling, and
volume term forever. Meanwhile the friction budget is inverted: leaving a half-typed set gets a
themed confirm, but Finish (prunes incomplete sets irreversibly) and Sign out (wipes any
unsynced local changes via resetLocalDb) fire immediately.

## Design decisions

1. **Per-set edit/delete in HistoryDetail.** Set rows become pressable and open the existing
   `EditSetSheet` (its mutations and `recomputeExercisePRs` call are already correct for
   finished workouts — recompute SQL only counts `ended_at IS NOT NULL`). A thin adapter maps
   DB `SetRow` → the sheet's `SetShape`. New optional `confirmDelete` prop on EditSetSheet
   (default false; HistoryDetail passes true) gates the sheet's Delete behind a destructive
   ConfirmSheet — a finished set is a record, an active one is scratch.
2. **Delete workout.** Ghost-destructive button at the bottom of HistoryDetail →
   destructive ConfirmSheet naming the blast radius ("Removes N exercises and their sets from
   history and records") → `deleteWorkoutAndRecompute` (new query-layer orchestration:
   `deleteWorkoutLocal` cascade + `recomputeExercisePRs` per distinct exercise) → invalidate
   history/personalRecords/workouts → `router.back()`.
3. **Finish confirm — only when destructive.** Finishing with zero incomplete sets stays
   one tap (it is now correctable after the fact). When incomplete sets exist, a destructive
   ConfirmSheet names the cost: "N incomplete sets will be discarded." Count derives from the
   already-loaded workout detail.
4. **Sign-out confirm — only when lossy.** At tap time query the outbox count directly (new
   `getOutboxCount()`, no reliance on possibly-stale `SyncState.pendingOutbox`). Count > 0 →
   destructive ConfirmSheet: "N unsynced changes will be lost." Count 0 → sign out
   immediately (fully recoverable via pull after re-login).
5. **Freshness.** HistoryDetail's correction path additionally invalidates
   `personalRecords(userId)` and `history(userId)` (the useFinishWorkout pattern) so Progress
   and History reflect the fix on next focus without waiting for a pull.

## Non-goals

Adding sets/exercises to a finished workout; editing workout title/date; undo; batch delete;
restoring soft-deleted workouts (tombstones per ADR 0003 make later restore possible but it is
not in this batch).

## Acceptance

- Sam's scenario: open the bad workout from History, tap the 300kg set, correct or delete it →
  Heaviest tile and chart reflect the truth after recompute; or delete the whole workout.
- Finish with all sets complete: unchanged single tap. Finish with 2 incomplete: confirm names "2".
- Sign out with clean outbox: immediate. With 3 pending: confirm names "3"; cancel keeps session.
- All mutations flow through enqueueMutation (outbox + cascade + emitMutationCommitted) — no
  new write paths.
