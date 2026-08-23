# Undo toasts for the delete paths (Impeccable round-2 follow-up)

- Date: 2026-08-23
- Status: implemented (2026-08-23)
- Source: Impeccable re-score provocative question 2 ("every irreversible act is guarded by a confirm, none by an undo")

## Problem

Delete-set and delete-workout are confirm-gated but one-way. A confirm shifts the burden to
the user's attention at the worst moment (mid-set, post-workout); an undo makes the same
action recoverable for a beat after it happens.

## Direction (approved)

Soft-delete + 10-second undo toast for the two delete paths; Finish and Sign-out keep their
conditional confirms (they are not deletes).

## Design sketch (validated and implemented, see plan `docs/superpowers/plans/2026-08-23-undo-toast-batch.md`)

1. **Mechanism**: rows already soft-delete via `deleted_at` tombstones (ADR 0003) with
   cascade + outbox rows. Undo = clear `deleted_at` on the parent (and cascaded children)
   and enqueue compensating outbox updates; recompute PRs again after restore.
   - Validated (implementation-time scout, re-checked against `src/sync/push.ts` and
     `src/sync/pull.ts`): push sends the restore as a plain `op:'update'` outbox row
     with payload `{ id, deleted_at: null }`, and `stripServerOwned` only strips
     `updated_at` — `deleted_at: null` goes to the server unfiltered, so the
     server-side column is honored exactly as sent. The outbox drains per-row FIFO
     (`drainBatch`'s `NOT EXISTS (... e.id < o.id)` guard admits only the
     lowest-id row per `(table_name, row_id)` per pass), so a row's delete —
     enqueued first, lower id — always ships before its restore-update becomes
     eligible; T1's `mutations.test.ts` pins this as `['delete','update']` per row.
     Pull's conflict resolution skips a row entirely while ANY pending
     insert/upsert/delete op sits in the outbox for it (`pullTable`'s
     `pending?.some(...)` check), so a mid-window server pull can never re-apply a
     stale tombstoned/live state over a delete or restore still in flight — the
     undo window can't be re-tombstoned mid-flight by a concurrent pull.
2. **UI**: reuse the existing Toast surface with an action slot ("Set deleted · UNDO",
   "Workout deleted · UNDO"); 10s presence; Reduce Motion honored (ToastContext already
   does). Deleting from HistoryDetail then navigating back must keep the toast alive —
   toast context is app-level (verify mount point above the navigator).
3. **Confirm sheets on the delete paths are REMOVED** (the whole point): delete is
   immediate + undoable. The `confirmDelete` prop on EditSetSheet and the
   delete-workout ConfirmSheet are gone; the r2 safe-path weighting stays for the
   remaining confirms (Finish with discards, Sign-out with unsynced, leave-set).
4. **Recompute cost**: delete + undo within 10s triggers two recomputes per exercise —
   acceptable (serialized, per-exercise).
5. **Tests**: undo restores rows + child cascade + PR rows; outbox net effect after
   delete+undo; toast-expiry finalizes (no lingering restore path).

## Non-goals

Undo for finish/sign-out; multi-level undo; undo after the toast expires (tombstones make a
future "recently deleted" surface possible — out of scope).
