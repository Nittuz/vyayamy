# ADR-0001: SQLite as source of truth, not Supabase

- **Status:** accepted
- **Date:** 2026-05 (when src/sync/ landed; ADR filed retrospectively on 2026-05-26)

## Context

FlexYug is a mobile strength-training journal used in gyms. The defining environment is a basement, a parking garage, a corner of a room with weak Wi-Fi and a phone that often has no carrier signal. Users log sets one at a time, several times per minute, often while resting between heavy lifts.

The primary action — record a completed set — has to feel instant and reliable. A spinner, a stale optimistic state, or a "tap save to retry" toast at any point in that loop is a failure of the product.

Two architectural paths fit the data model:

1. Supabase as source of truth; client reads/writes over HTTPS; cache for offline.
2. Local SQLite as source of truth; Supabase as a durable mirror; the network is a background concern.

## Decision

We will treat **SQLite on the device as the source of truth** for an active session. Every user action writes to SQLite synchronously inside a transaction; the network is touched only by the sync engine in [src/sync/](../../src/sync/), asynchronously, after the local write has already committed.

## Alternatives considered

- **Supabase as source of truth with offline cache (e.g., React Query mutations with retry).** Rejected: every write becomes a network event in the critical path, and the offline story becomes a layer of cache-invalidation logic on top of HTTP failures. Even with good optimism, the UI has to reason about pending/error/retry states for every set. Correctness ends up coupled to network behavior we don't control.
- **A heavier local-first framework (WatermelonDB, RxDB, PowerSync).** Rejected: see [ADR-0002](0002-outbox-over-crdt.md). Last-write-wins semantics and a single-user product don't justify the abstraction tax.
- **No local persistence — fully online with a fast spinner.** Rejected: the product's job description ("capture strength training reliably, offline, and fast") is incompatible with this option.

## Consequences

- Positive: writes finish in microseconds and survive app kills; the UI never spins; the product still works in a faraday-cage gym.
- Positive: the sync engine becomes a contained subsystem ([src/sync/](../../src/sync/)) rather than a property of every screen.
- Negative: the SQLite schema must be kept in sync with the Postgres schema by hand ([src/db/schema.ts](../../src/db/schema.ts) mirrors [supabase/migrations/](../../supabase/migrations/)). A drift here is a sync correctness bug.
- Negative: cross-device features (multi-device editing, web client, social) need a different conflict story; they are explicitly out of scope today.
- Follow-ups: [ADR-0002](0002-outbox-over-crdt.md), [ADR-0003](0003-soft-delete-tombstones.md), [ADR-0004](0004-server-owned-updated-at.md).
