-- 00009_security_hardening.sql
--
-- Closes the four security/correctness gaps surfaced by the May 2026 review:
--
--   1. RLS policies that used FOR ALL USING (...) without WITH CHECK silently
--      allowed authenticated users to INSERT rows owned by another user_id, or
--      UPDATE the user_id column to transfer ownership. Mirroring the USING
--      predicate into WITH CHECK closes both holes.
--   2. updated_at was being supplied by the client (device clock). Cross-device
--      sync therefore corrupted the per-table high-water mark on clock skew,
--      and BEFORE UPDATE triggers never fired on INSERT so client-supplied
--      values stuck on first write. We now overwrite updated_at server-side
--      on every insert AND update, and drop the column from sync payloads
--      client-side (push.ts).
--   3. handle_new_user() was SECURITY DEFINER without a locked search_path —
--      a classic Supabase footgun. We lock it to public, pg_temp and revoke
--      the implicit grant to PUBLIC.
--   4. personal_records.set_id had no FK; orphan rows possible. Add the FK.
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Tighten RLS policies: add WITH CHECK to every FOR ALL.
--
-- Postgres does not auto-mirror USING into WITH CHECK on FOR ALL policies.
-- Without WITH CHECK, INSERT is unconstrained and UPDATE can mutate rows so
-- they no longer satisfy the visibility predicate (and stay there).
-- ---------------------------------------------------------------------------

-- workouts
DROP POLICY IF EXISTS workouts_all_own ON public.workouts;
CREATE POLICY workouts_all_own ON public.workouts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- workout_exercises (parent ownership via workouts)
DROP POLICY IF EXISTS workout_exercises_all ON public.workout_exercises;
CREATE POLICY workout_exercises_all ON public.workout_exercises
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );

-- sets (parent ownership via workout_exercises -> workouts)
DROP POLICY IF EXISTS sets_all ON public.sets;
CREATE POLICY sets_all ON public.sets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

-- personal_records
DROP POLICY IF EXISTS personal_records_all_own ON public.personal_records;
CREATE POLICY personal_records_all_own ON public.personal_records
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- templates
DROP POLICY IF EXISTS templates_all_own ON public.templates;
CREATE POLICY templates_all_own ON public.templates
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- exercises_update_own — UPDATE policy in 00001 had USING but no WITH CHECK,
-- so a user could mutate one of their custom exercises to set user_id = NULL
-- and effectively promote it to the global catalog. Tighten.
DROP POLICY IF EXISTS exercises_update_own ON public.exercises;
CREATE POLICY exercises_update_own ON public.exercises
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- profiles_update_own — same hole. id is the PK so harder to abuse, but lock it.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- training_plans
DROP POLICY IF EXISTS training_plans_all_own ON public.training_plans;
CREATE POLICY training_plans_all_own ON public.training_plans
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- training_plan_slots (parent ownership via training_plans)
DROP POLICY IF EXISTS training_plan_slots_all ON public.training_plan_slots;
CREATE POLICY training_plan_slots_all ON public.training_plan_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.training_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Server-side updated_at. The client must never set it.
--
-- The existing set_updated_at() function only handled UPDATE (BEFORE UPDATE
-- trigger). New triggers force NEW.updated_at = now() on INSERT too, so a
-- clock-skewed device cannot poison the high-water mark.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'exercises',
    'workouts',
    'workout_exercises',
    'sets',
    'personal_records',
    'templates',
    'training_plans',
    'training_plan_slots',
    'plan_presets',
    'plan_preset_templates',
    'plan_preset_exercises',
    'plan_preset_slots'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I;',
      tbl || '_touch_updated_at_ins', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();',
      tbl || '_touch_updated_at_ins', tbl
    );
    -- The legacy BEFORE UPDATE trigger (set_updated_at) is now redundant.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', tbl || '_updated_at', tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user(): lock search_path, revoke PUBLIC.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, units)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', 'kg');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. personal_records.set_id FK. Soft FK so soft-deleting a set does not
--    cascade-hard-delete the PR; pruning happens via the sync engine's
--    deleted_at filter at read time.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personal_records_set_id_fkey'
  ) THEN
    ALTER TABLE public.personal_records
      ADD CONSTRAINT personal_records_set_id_fkey
      FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE SET NULL;
  END IF;
END $$;
