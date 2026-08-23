# PR semantics: heaviest weight + most reps (volume record removed)

- Date: 2026-08-09
- Status: approved (owner), Batch 2 of the 2026-08-09 review roadmap
- Parent: docs/specs/2026-08-09-entry-branding-refresh-and-roadmap.md

## Problem

The Progress screen leads with the "Best volume" record — a single set's
weight×reps in kg, which reads as a meaningless number ("2,400"). Owner
definition of a PR: the weight the user lifted, or the reps the user did.
Separately, bodyweight exercises (pull-ups, dips, push-ups) earn zero records
of any kind because every record branch requires weight > 0.

## Record model

Two persisted record types per exercise (was three):

| type              | value                        | semantics                                                                                                                                  |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `heaviest_weight` | `{ weightKg }`               | max weight across completed sets (kg-normalized). Unchanged.                                                                               |
| `most_reps`       | `{ reps, weightKg \| null }` | max reps in a single completed set, **including bodyweight (null-weight) sets**; ties broken by heavier weight (null loses to any weight). |

Removed: `best_volume`. Renamed/reshaped: `most_reps_at_weight` → `most_reps`
(old type keys become unknown). The recompute loop deletes any cached row whose
type is not in `PR_TYPES`, so existing installs self-heal without a migration —
`personal_records` is a local, never-synced derived cache.

Volume is NOT removed from the app: the in-session volume bar and the Progress
volume trend chart remain. Volume just stops being a "record."

## Rules preserved

- kg canonical: compare via `toKg`; convert only at render.
- Only completed sets from finished workouts count toward persisted records.
- Bodyweight convention stays `weight IS NULL` (never 0).
- Recompute stays authoritative (writes down, deletes unbacked) and serialized.
- A brand-new exercise's first set establishes a baseline; it is not a PR.

## Live celebration (engagement)

`sessionPRs` currently fires only on weight records, so bodyweight sets never
celebrate. Extension: a **weightless** set celebrates when its reps beat the
exercise's all-time `most_reps` value; weighted sets keep weight-only behavior
but still raise the running rep baseline. One set still produces at most one
live signal.

Seeding: weight seeds read the `heaviest_weight` cache rows (stable across the
schema change, already kg); **rep seeds are computed directly from the sets
table** (`MAX(reps)` per exercise over completed sets in finished workouts).
Reading rep seeds from the cache would open a migration window — `most_reps`
rows don't exist until a recompute runs, and the backfill is gated behind a
Progress mount, so a first post-upgrade session would celebrate bogus rep PRs
(review finding, confirmed). Reps need no unit normalization, so the direct
query is exact and cheap on a local DB.

**Known limitation (accepted):** during a bodyweight-only session the live PR
pill fires on the session volume bar, whose headline reads 0 (BW sets carry no
volume — pre-existing trait from the set-entry spec §4). Revisit with the
Batch 3 session-capture polish.

## UI changes (Progress)

- Stat tiles: **Heaviest leads**, "Most reps" second. Display format:
  `15 BW` for a bodyweight record, `12 × 80 kg` for a loaded one — the unit is
  spelled out because the weight converts to the display unit and a bare
  number would be ambiguous (review finding). Volume tile removed.
- Per-exercise PR strip: fixed order — Heaviest · Most reps (today it follows
  achieved_at SQL order, effectively random).
- Chart: metric toggle becomes Heaviest | Volume | **Reps** (best single-set
  reps per day, loaded sets included). Added because bodyweight-only exercises
  now enter the PR list but have nothing to plot on the weight/volume series
  (review finding); selecting an exercise with no weight record auto-lands on
  the Reps metric.

## Consistency fixes bundled

- `PR_BACKFILL_SCHEMA` bumped (1 → 2) in the same commit as the formula change
  so every device re-backfills exactly once.
- `getHeaviestWeightHistory` / `getBestSetVolumeHistory` gain the
  `w.ended_at IS NOT NULL` filter the recompute queries already apply, so the
  chart peak can no longer exceed the Heaviest tile.
- Stale comment on `queryKeys.sets.weightHistory` corrected (it backs both
  chart series).
- `ARCHITECTURE.md` "Personal Record Detection" table updated to two types.

## Tests

- `computePRs`: BW-only history yields a `most_reps` record and no
  `heaviest_weight`; mixed history tie-breaks; no `best_volume` emitted.
- Cache: recompute deletes rows of retired types (`best_volume`,
  `most_reps_at_weight`); `most_reps` display formatting (`12 BW`, `12 × 80 kg`).
- History series: in-progress workouts excluded.
- `sessionPRs`: BW set beating all-time reps celebrates; first-ever BW set does
  not; weighted sets unaffected.

## Out of scope

e1RM estimation (rejected for now — show real numbers, not derived math);
per-exercise detail screen; history-detail PR annotations.
