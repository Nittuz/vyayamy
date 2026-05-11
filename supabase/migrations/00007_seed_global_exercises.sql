-- 00007_seed_global_exercises.sql
--
-- Seeds a small catalog of canonical compound and accessory lifts as
-- *global* exercises (user_id IS NULL). The existing RLS policy
-- `exercises_select` already lets every authenticated user read these
-- (USING user_id IS NULL OR user_id = auth.uid()).
--
-- These rows back the generic Tier-1 plan presets seeded in 00008.
-- When a user picks a preset, the client resolves each preset exercise
-- by case-insensitive name match against this catalog (preferring
-- user_id IS NULL rows) and falls back to creating a user-scoped
-- exercise if no global match exists. So this catalog can grow over
-- time without breaking historical applies.
--
-- Idempotent: ON CONFLICT DO NOTHING against an open expression index
-- on (lower(name)) where user_id IS NULL, so re-running the migration
-- or shipping a follow-up that re-seeds doesn't duplicate rows.

-- Open index so the upsert is well-defined. Partial index keyed on
-- lower(name) where user_id IS NULL guarantees global-name uniqueness
-- without touching user-scoped exercises (where collisions are fine).
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_global_name_unique
  ON public.exercises ((lower(name)))
  WHERE user_id IS NULL;

INSERT INTO public.exercises (name, muscle_group, user_id) VALUES
  -- Squat family
  ('Back Squat',           'Legs',     NULL),
  ('Front Squat',          'Legs',     NULL),
  ('Goblet Squat',         'Legs',     NULL),
  ('Walking Lunge',        'Legs',     NULL),
  ('Leg Press',            'Legs',     NULL),
  ('Hip Thrust',           'Legs',     NULL),
  ('Calf Raise',           'Legs',     NULL),

  -- Hinge family
  ('Conventional Deadlift', 'Legs',    NULL),
  ('Romanian Deadlift',     'Legs',    NULL),

  -- Push
  ('Bench Press',           'Chest',   NULL),
  ('Incline Dumbbell Press','Chest',   NULL),
  ('Push-Up',               'Chest',   NULL),
  ('Overhead Press',        'Shoulders', NULL),
  ('Lateral Raise',         'Shoulders', NULL),
  ('Tricep Pushdown',       'Arms',    NULL),

  -- Pull
  ('Bent-Over Row',         'Back',    NULL),
  ('Inverted Row',          'Back',    NULL),
  ('Pull-Up',               'Back',    NULL),
  ('Lat Pulldown',          'Back',    NULL),
  ('Face Pull',             'Back',    NULL),
  ('Bicep Curl',            'Arms',    NULL),

  -- Core / carry
  ('Plank',                 'Core',    NULL),
  ('Hanging Leg Raise',     'Core',    NULL),
  ('Farmer Carry',          'Full Body', NULL),

  -- Conditioning
  ('Box Jump',              'Full Body', NULL)
ON CONFLICT ((lower(name))) WHERE user_id IS NULL DO NOTHING;
