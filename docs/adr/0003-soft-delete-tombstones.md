# ADR-0003: Soft-delete tombstones, never hard delete

- **Status:** accepted
- **Date:** 2025-04 (best estimate; ADR filed retrospectively on 2026-05-26)

## Context

Sync uses incremental pull keyed on `updated_at` (see [ADR-0002](0002-outbox-over-crdt.md)). The pull cursor is "give me every row updated after my last cursor".

If we hard-delete a row on the server, no future pull will ever observe its absence — incremental pull cannot see what isn't there. The deletion would silently fail to propagate. The reciprocal problem on the client: a row deleted locally must still convey its existence and deletion status to the server.

This applies to every row a user can mutate (workouts, sets, templates, plans, custom exercises, PRs).

## Decision

Every synced table carries a `deleted_at TIMESTAMPTZ` column (nullable; `NULL` means live). Deletes are implemented as `UPDATE row SET deleted_at = now(), updated_at = now()`. **Hard `DELETE` is never issued by the application** on synced tables.

Application reads filter `WHERE deleted_at IS NULL`. Sync code (pull, RLS policies) does **not** filter — tombstones must be visible to the owner so the deletion propagates.

`enqueueMutation` cascades soft-deletes to FK children locally and writes the corresponding child outbox rows in the same transaction, so a fresh device's pull never observes orphaned-but-live rows.

## Alternatives considered

- **Separate `tombstones` table.** Rejected: doubles the schema (every entity gets a shadow table), complicates RLS (a tombstone reveals the row's existence; permissions must mirror the live table), and the join on read is a constant tax for a soft-delete rate that is low.
- **Hard delete + a snapshot pull on every launch.** Rejected: defeats incremental pull; would mean re-downloading the user's full history every app start.
- **Hard delete + a `change_log` event table.** Rejected: same complexity cost as the tombstone table, with extra ordering/replay machinery. The product is not a CDC system; last-write-wins by `updated_at` is the model.

## Consequences

- Positive: deletions propagate across devices via the same incremental-pull machinery as updates. No special case in the sync engine.
- Positive: accidental deletes are recoverable until a future compaction pass (no such pass exists today; soft-deleted rows live forever).
- Positive: foreign-key integrity is preserved — a parent's soft-delete is visible to children, but rows still satisfy FK constraints.
- Negative: storage grows monotonically. No automatic GC of long-tombstoned rows; deferred until volume justifies it (see [docs/local-first-sync.md](../local-first-sync.md) "Intentionally Deferred").
- Negative: every application query must remember `WHERE deleted_at IS NULL`. This is a convention enforced by review, not by the type system.
- Follow-ups: [ADR-0004](0004-server-owned-updated-at.md).
