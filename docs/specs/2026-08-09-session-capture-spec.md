# Session capture: times in history + workout/exercise notes

- Date: 2026-08-09
- Status: approved (owner) — Batch 3 of the 2026-08-09 review roadmap
- Parent: docs/specs/2026-08-09-entry-branding-refresh-and-roadmap.md

## Problem

A finished session answers "what" (sets, weight × reps) but not "when" beyond
the date — set `completed_at` timestamps exist and are never shown. And there
is no free-form capture anywhere: "no carbs today, low energy" or "grip
slipped on rows" has no home.

## Times (display only, no schema change)

- HistoryDetail header: start time of day joins the date — "Aug 9 · 7:42 PM ·
  48 min" (device-local, from `workout.started_at`).
- Each exercise block shows the time of its first completed set ("7:45 PM"),
  answering "when did I do this exercise."
- Set rows stay as they are — no per-set time column (clutter beats value at
  the row level; the data remains available for a future detail affordance).

## Notes (workout + exercise — owner decision)

Granularity: one optional note per workout ("low energy, no carbs") and one
optional note per workout exercise ("grip slipped"). No per-set notes.

### Schema

- Supabase migration: `ALTER TABLE workouts ADD COLUMN note TEXT;`
  `ALTER TABLE workout_exercises ADD COLUMN note TEXT;` (nullable, no default,
  no constraint — free text).
- Local mirror: same columns in `src/db/schema.ts` CREATE TABLE statements plus
  a SCHEMA_VERSION bump with ALTER steps for existing installs.
- `src/db/types.ts`: `note: string | null` on both Row types.
- Sync: no changes — push sends whole rows, pull upserts whole rows; RLS
  policies are row-level and unchanged.

### Capture UI (active workout)

One quiet entry point, one sheet (`NoteSheet`): a ghost "Notes" row below
"Add exercise" opens a sheet with TWO multiline fields — the session note and
a note for the current exercise. Save writes only the fields that changed
(`workouts.note` / `workout_exercises.note`) through the outbox; empty text
clears (NULL). Reopening shows current text; editable any time during the
session. (Refined from the draft's two separate affordances — one entry point
beats two obscure ones and keeps ActiveSetCard untouched.)

Finish recap: a ghost "Session note" / "Edit session note" button under the
finish actions opens the same sheet with the session field only — the natural
"how did it go" moment; no forced prompt.

### Display (history)

- HistoryDetail: workout note renders under the header; an exercise note
  renders under its exercise name. Quiet styling (meta ink) — a note is a
  record, not a call to action.

## Bundled polish (Batch 2 carry-over)

Bodyweight-only sessions celebrate rep PRs on a volume bar whose headline
reads 0. Accepted then; addressed here as part of the session-surface work if
the change stays small (e.g. the bar's headline falls back to completed-set
count for zero-volume sessions); otherwise re-logged.

## Review-driven hardening (adversarial review, 6 confirmed findings)

- The v5 local migration also rewinds the pull cursor (`sync_meta`) for
  workouts/workout_exercises: a device that pulled rows while it lacked the
  note column dropped the column silently and advanced its cursor, so notes
  written in that window would never arrive without a one-time re-pull.
- NoteSheet's exercise target is snapshotted at open time (a voice
  "next exercise" behind the modal must not retarget typed text).
- Save diffs against the seeded baseline, not the live prop (an untouched
  field can't clobber a value that synced in from another device).
- Dismissing the sheet saves; unmount mid-typing flushes unsaved changes; the
  body scrolls (small screens + keyboard); the sheet stays mounted through the
  one-tick cursor-transition placeholder.

## Non-goals

Per-set notes; editing notes from history; voice note dictation; note search;
any templating/tagging of notes.

## Tests

- Schema gate: version bump applies ALTERs on an existing v-previous database.
- Mutations: setting a workout/exercise note writes the row and enqueues
  exactly one outbox op for the right table (and never for personal_records).
- Format: the new time-of-day formatter (device-local, honors 12/24h locale).
- History query returns the new columns.
