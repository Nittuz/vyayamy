-- Session capture notes (spec 2026-08-09-session-capture): one free-form note
-- per workout ("low energy, no carbs") and per workout exercise ("grip
-- slipped"). Nullable free text; no per-set notes. RLS is row-level and
-- unchanged; sync sends whole rows, so no push/pull changes are needed.

alter table public.workouts add column if not exists note text;
alter table public.workout_exercises add column if not exists note text;
