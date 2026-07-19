# Design Specs

This directory holds per-feature design documents. A spec describes what is being built, why, how, and what alternatives were considered, **before** implementation begins.

## When to write a design spec

Write a spec when you're about to **build or explore a feature**. Heuristics:

- "Here is how feature X works, here are the screens, here is the data flow" — yes, spec.
- "We will use library A over library B" — no, ADR (see [../adr/](../adr/)).
- "Fix this typo" / "rename this variable" — no, just do it.

Specs are **edited freely** in `draft` and `approved`; **frozen** on `implemented`; **archived** if abandoned or superseded.

## Lifecycle

```mermaid
flowchart LR
  draft --> approved
  draft --> archived
  approved --> implemented
  approved --> archived
  implemented --> archived
```

- **draft** — exploring; may be abandoned. Folds in the "RFC" role: an unsure-if-we'll-ship spec lives here.
- **approved** — design locked, ready to build.
- **implemented** — shipped. The spec is now historical; do not edit (write a new spec or an ADR for revisions).
- **archived** — abandoned, superseded, or no longer relevant. Kept for context.

## Index

| Date                                                     | Title                                | Status      |
| -------------------------------------------------------- | ------------------------------------ | ----------- |
| [2026-05-26](2026-05-26-docs-uplevel-design.md)          | Docs Uplevel: ADRs + Design Specs    | implemented |
| [2026-06-10](2026-06-10-deep-review-improvement-plan.md) | Deep Review — improvement plan       | implemented |
| [2026-07-11](2026-07-11-taste-audit.md)                  | Taste Audit (round 2)                | implemented |
| [2026-07-11](2026-07-11-blacktop-overhaul-spec.md)       | Blacktop Overhaul — Direction C spec | implemented |

### Archived

Superseded phase specs (the 2026-05/06 Uplevel, Restrained Flourish, Voice Logging, and SDK 56 scoping documents) were frozen after implementation and have been removed from the working tree — retrieve them from git history under `docs/specs/archive/` if needed. The behavior they described lives in the code and in [../adr/](../adr/).

## Template

See [TEMPLATE.md](TEMPLATE.md). Copy it to `YYYY-MM-DD-<topic>-design.md` and fill in.
