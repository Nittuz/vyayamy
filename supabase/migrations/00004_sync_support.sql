-- 00004_sync_support.sql
--
-- Adds the two columns every table needs to participate in the
-- local-first sync engine:
--
--   updated_at  — advances on every mutation, used as the per-table
--                 high-water mark for incremental pull.
--   deleted_at  — soft-delete tombstone. Hard deletes would silently
--                 drop from incremental pull responses, so clients
--                 can never observe the deletion. Application code
--                 must filter `WHERE deleted_at IS NULL` for reads.
--
-- Rolls forward non-destructively; safe to run on an existing DB.

-- 1. Add updated_at where missing (profiles/templates/training_plans already have it).
ALTER TABLE public.exercises           ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.workouts            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.workout_exercises   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sets                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.personal_records    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.training_plan_slots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Add deleted_at everywhere. Nullable on purpose; NULL = live row.
ALTER TABLE public.profiles            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.exercises           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.workouts            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.workout_exercises   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.sets                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.personal_records    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.templates           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.training_plans      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.training_plan_slots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Attach the existing set_updated_at() trigger to every table that
--    doesn't already have it. The function itself was created in
--    00001_initial_schema.sql; reuse it.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'exercises',
    'workouts',
    'workout_exercises',
    'sets',
    'personal_records',
    'training_plan_slots'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I;',
      tbl || '_updated_at', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();',
      tbl || '_updated_at', tbl
    );
  END LOOP;
END $$;

-- 4. Sync-friendly indexes on updated_at for every table the client pulls.
--    Incremental pull always looks like `WHERE updated_at > :cursor ORDER BY updated_at`.
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at            ON public.profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_exercises_updated_at           ON public.exercises(updated_at);
CREATE INDEX IF NOT EXISTS idx_workouts_updated_at            ON public.workouts(updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_updated_at   ON public.workout_exercises(updated_at);
CREATE INDEX IF NOT EXISTS idx_sets_updated_at                ON public.sets(updated_at);
CREATE INDEX IF NOT EXISTS idx_personal_records_updated_at    ON public.personal_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_updated_at           ON public.templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_training_plans_updated_at      ON public.training_plans(updated_at);
CREATE INDEX IF NOT EXISTS idx_training_plan_slots_updated_at ON public.training_plan_slots(updated_at);

-- 5. Note on RLS:
--    All existing policies in 00001 are USING (user_id = auth.uid()) style,
--    which correctly returns *tombstoned* rows to their owner. Application
--    code filters out deleted_at-set rows at the query layer for normal
--    reads; the sync engine intentionally does NOT filter, so tombstones
--    propagate to every device.
