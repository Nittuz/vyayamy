# ADR-0002: Outbox over CRDTs and sync frameworks

- **Status:** accepted
- **Date:** 2025-04 (best estimate; ADR filed retrospectively on 2026-05-26)

## Context

Given [ADR-0001](0001-sqlite-as-source-of-truth.md), the client owns the data during a session and Supabase is a downstream mirror. We need a sync mechanism that survives:

- Offline writes (gym, plane mode, locked phone)
- App kills mid-write
- Network glitches and 5xx responses
- Eventual reconnection with a backlog to flush

The product is effectively single-user and often single-device. Real concurrent edits to the same row are rare; when they happen, last-write-wins is the right answer.

## Decision

We will record every server-side effect as an explicit row in a local `outbox` table inside the same transaction as the local write. A small in-house sync engine ([src/sync/](../../src/sync/)) drains the outbox FIFO against Supabase PostgREST whenever the network is reachable.

## Alternatives considered

- **CRDT-based sync (Y.js, Automerge).** Rejected: CRDTs are correct for genuinely concurrent multi-writer scenarios. We are single-writer per row in practice, and the CRDT tax (data-model constraints, library size, debuggability) buys us no value here.
- **A turnkey local-first framework (WatermelonDB, RxDB, PowerSync).** Rejected: opaque internals, bigger dependency surface, and they impose their own data model. Our schema is already shared with Postgres; introducing a third schema authority is worse than maintaining the explicit `src/db/schema.ts` mirror.
- **Direct write-through (UI calls `supabase.from(...).insert()`) with a queue on failure.** Rejected: collapses the offline path into an exception case, which is the opposite of "local-first". Every UI surface ends up reasoning about HTTP errors.

## Consequences

- Positive: the smallest abstraction that survives offline, retries, and poisoned writes; the server stays boring (plain PostgREST + RLS).
- Positive: explicit outbox rows are introspectable — a poisoned row is a visible artifact with a `last_error` we can read.
- Positive: incremental pull is symmetric and equally explicit ([src/sync/pull.ts](../../src/sync/pull.ts)).
- Negative: we maintain sync engine code (push, pull, state, conflict rule). When the rules need to evolve, we have to evolve them.
- Negative: the "drain FIFO" rule is simple but means a poisoned head row could delay later rows; the current implementation uses per-row backoff + skip-and-continue to avoid head-of-line blocking. See [docs/local-first-sync.md](../local-first-sync.md).
- Follow-ups: [ADR-0003](0003-soft-delete-tombstones.md), [ADR-0004](0004-server-owned-updated-at.md).
