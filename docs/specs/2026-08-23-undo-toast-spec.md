# Undo toasts for the delete paths (Impeccable round-2 follow-up)

- Date: 2026-08-23
- Status: draft (owner approved direction "Both" 2026-08-23: confirm-sheet weighting shipped in r2; this spec covers the undo half — NOT yet scheduled)
- Source: Impeccable re-score provocative question 2 ("every irreversible act is guarded by a confirm, none by an undo")

## Problem

Delete-set and delete-workout are confirm-gated but one-way. A confirm shifts the burden to
the user's attention at the worst moment (mid-set, post-workout); an undo makes the same
action recoverable for a beat after it happens.

## Direction (approved)

Soft-delete + 10-second undo toast for the two delete paths; Finish and Sign-out keep their
conditional confirms (they are not deletes).

## Design sketch (to be validated at implementation time)

1. **Mechanism**: rows already soft-delete via `deleted_at` tombstones (ADR 0003) with
   cascade + outbox rows. Undo = clear `deleted_at` on the parent (and cascaded children)
   and enqueue compensating outbox updates; recompute PRs again after restore.
   - Open question: outbox semantics for delete-then-undo inside one push window —
     ideally the pair collapses; at minimum the server's soft-delete + un-delete both
     apply idempotently (server keeps `deleted_at` as a plain column, so an update
     restoring `deleted_at = null` must be honored; verify pull/push treat it symmetrically).
2. **UI**: reuse the existing Toast surface with an action slot ("Set deleted · UNDO",
   "Workout deleted · UNDO"); 10s presence; Reduce Motion honored (ToastContext already
   does). Deleting from HistoryDetail then navigating back must keep the toast alive —
   toast context is app-level (verify mount point above the navigator).
3. **Confirm sheets on the delete paths are then REMOVED** (the whole point): delete
   becomes immediate + undoable. `confirmDelete` prop on EditSetSheet and the
   delete-workout ConfirmSheet go away; the r2 safe-path weighting stays for the
   remaining confirms (Finish with discards, Sign-out with unsynced, leave-set).
4. **Recompute cost**: delete + undo within 10s triggers two recomputes per exercise —
   acceptable (serialized, per-exercise).
5. **Tests**: undo restores rows + child cascade + PR rows; outbox net effect after
   delete+undo; toast-expiry finalizes (no lingering restore path).

## Non-goals

Undo for finish/sign-out; multi-level undo; undo after the toast expires (tombstones make a
future "recently deleted" surface possible — out of scope).
