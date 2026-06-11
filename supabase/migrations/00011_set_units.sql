-- Per-set units (deep-review #131).
--
-- Weight has always been stored as a unitless number while profiles.units was
-- only a display label, so toggling kg/lb silently reinterpreted every
-- historical set. Recording the unit per set fixes that: a set keeps the unit
-- it was logged in regardless of later preference changes.
--
-- Existing weight-bearing rows are backfilled with the owning user's current
-- units — the unit the number was entered and displayed in — so no historical
-- weight changes meaning. Empty staged sets (no weight) stay NULL and get their
-- unit when a weight is first written. The local SQLite migration in
-- src/db/client.ts performs the equivalent backfill on each device.

ALTER TABLE public.sets ADD COLUMN IF NOT EXISTS units TEXT;

ALTER TABLE public.sets DROP CONSTRAINT IF EXISTS sets_units_check;
ALTER TABLE public.sets
  ADD CONSTRAINT sets_units_check CHECK (units IS NULL OR units IN ('kg', 'lb'));

UPDATE public.sets s
SET units = p.units
FROM public.workout_exercises we
JOIN public.workouts w ON w.id = we.workout_id
JOIN public.profiles p ON p.id = w.user_id
WHERE s.workout_exercise_id = we.id
  AND s.weight IS NOT NULL
  AND s.units IS NULL;
