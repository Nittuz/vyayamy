-- Unique constraint on personal_records so upsert works correctly
-- Only keep the latest record per (user, exercise, type)
CREATE UNIQUE INDEX idx_personal_records_unique
  ON public.personal_records (user_id, exercise_id, type);

-- Constrain muscle_group to a known set of values
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_muscle_group_check
  CHECK (
    muscle_group IS NULL OR muscle_group IN (
      'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full Body', 'Cardio', 'Other'
    )
  );
