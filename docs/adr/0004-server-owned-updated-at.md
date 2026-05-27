# ADR-0004: Server-owned `updated_at` (clients never set it)

- **Status:** accepted
- **Date:** 2025-05 (matches migration `00009_security_hardening.sql`; ADR filed retrospectively on 2026-05-26)

## Context

Incremental pull uses `updated_at` as the high-water mark: "give me everything updated after my last cursor". Two correctness requirements follow:

1. `updated_at` must be **monotonically increasing per server-side write** — otherwise a row could be modified but skipped by a later pull.
2. The high-water mark must be **immune to client clock skew** — otherwise a phone with a wrong clock can either (a) write rows with `updated_at` in the future, poisoning every other device's cursor, or (b) write rows with `updated_at` in the past, causing them to be skipped on pull.

The original `00004_sync_support.sql` migration created `updated_at` with a `DEFAULT now()` and a client-settable column. The push engine was setting it from `new Date().toISOString()` on the device.

## Decision

`updated_at` is **owned by the server**. A `BEFORE INSERT OR UPDATE` trigger (`public.touch_updated_at()`) overwrites the column to `now()` (server time) on every write. The client **never** sends `updated_at` in any payload to PostgREST; if it does, the trigger silently overwrites it.

The local SQLite mirror still maintains its own `updated_at` for local writes (it has to — there's no server in the picture during a local write), but that value is overwritten on the next pull when the server's authoritative value comes back.

## Alternatives considered

- **Trust the client clock.** Rejected: skew is real, and one bad phone can wedge sync for every device that user owns.
- **Server-side check that rejects writes with `updated_at` more than N seconds in the future.** Rejected: half-measure; still depends on a tolerance window, still leaves "slightly skewed" clocks corrupting order.
- **Use a separate monotonic sequence column (`xmin`, `lsn`).** Rejected: complicates RLS, harder to debug, and the per-table `updated_at` timestamp is human-readable for forensics.

## Consequences

- Positive: cursor advance is correct regardless of any client's clock. Sync is robust to skewed phones.
- Positive: writes are simpler — the client doesn't have to compute `updated_at` consistently across paths.
- Positive: forensic debugging ("when did the server actually see this write?") works against `updated_at` directly.
- Negative: the local `updated_at` immediately after a local write is *not* the server's `updated_at`. Code that compares local and server timestamps must be aware of this brief window (in practice this only matters inside the sync engine, and is documented in `docs/local-first-sync.md`).
- Negative: introducing a new synced table without the trigger is a silent bug — the high-water mark stops advancing for that table. Enforced today by checklist in [AGENTS.md](../../AGENTS.md) and [docs/operations.md](../operations.md); a CI lint that audits new migrations would be stronger but is not in place.
- Follow-ups: see `supabase/migrations/00009_security_hardening.sql` for the trigger DDL.
