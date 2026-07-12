# Architecture Decision Records

This directory records foundational architectural decisions for FlexYug. Each ADR captures one decision: the context that forced it, the choice that was made, the alternatives that were rejected, and the consequences we accept.

## When to write an ADR

Write an ADR when you make a **long-lived choice between real alternatives**. Heuristics:

- "We will use X over Y" with X and Y both plausible — yes, ADR.
- "We will name this variable `foo`" — no, code comment.
- "Here is how feature Z works" — no, design spec (see [../specs/](../specs/)).

ADRs are **immutable once accepted**. To change a decision, write a new ADR that supersedes the old one; cross-link both.

## Status legend

- **proposed** — under discussion; may be rejected or withdrawn.
- **accepted** — in force; the codebase reflects this.
- **superseded** — replaced by a later ADR; kept for historical context, never deleted.

## Index

| #                                         | Title                                            | Status   | Date    |
| ----------------------------------------- | ------------------------------------------------ | -------- | ------- |
| [0001](0001-sqlite-as-source-of-truth.md) | SQLite as source of truth, not Supabase          | accepted | 2026-05 |
| [0002](0002-outbox-over-crdt.md)          | Outbox over CRDTs and sync frameworks            | accepted | 2026-05 |
| [0003](0003-soft-delete-tombstones.md)    | Soft-delete tombstones, never hard delete        | accepted | 2026-05 |
| [0004](0004-server-owned-updated-at.md)   | Server-owned `updated_at` (clients never set it) | accepted | 2026-05 |

## Template

See [TEMPLATE.md](TEMPLATE.md). Copy it to `NNNN-slug.md` and fill in. Use the next sequential number — ADRs are an ordered ledger, not date-keyed.
