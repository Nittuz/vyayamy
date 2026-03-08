-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  units TEXT NOT NULL DEFAULT 'kg' CHECK (units IN ('kg', 'lb')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exercises (global + user custom)
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  muscle_group TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workouts
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  title TEXT NOT NULL,
  template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Templates (referenced by workouts; create table after workouts for FK)
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercise_order UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;

-- Workout exercises (junction + order)
CREATE TABLE public.workout_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sets
CREATE TABLE public.sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_exercise_id UUID NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  weight NUMERIC,
  reps INT,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Personal records
CREATE TABLE public.personal_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value JSONB NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  set_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_workouts_user_started ON public.workouts(user_id, started_at DESC);
CREATE INDEX idx_workouts_ended ON public.workouts(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_workout_exercises_workout ON public.workout_exercises(workout_id);
CREATE INDEX idx_sets_workout_exercise ON public.sets(workout_exercise_id);
CREATE INDEX idx_personal_records_user_exercise ON public.personal_records(user_id, exercise_id, type);
CREATE INDEX idx_exercises_user ON public.exercises(user_id);
CREATE INDEX idx_templates_user ON public.templates(user_id);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read/update own
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Exercises: read global (user_id null) or own; insert/update own only
CREATE POLICY exercises_select ON public.exercises FOR SELECT USING (
  user_id IS NULL OR user_id = auth.uid()
);
CREATE POLICY exercises_insert_own ON public.exercises FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY exercises_update_own ON public.exercises FOR UPDATE USING (user_id = auth.uid());

-- Workouts: own only
CREATE POLICY workouts_all_own ON public.workouts FOR ALL USING (user_id = auth.uid());

-- Workout_exercises: via workout ownership
CREATE POLICY workout_exercises_all ON public.workout_exercises FOR ALL USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);

-- Sets: via workout ownership
CREATE POLICY sets_all ON public.sets FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workout_exercises we
    JOIN public.workouts w ON w.id = we.workout_id
    WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
  )
);

-- Personal records: own only
CREATE POLICY personal_records_all_own ON public.personal_records FOR ALL USING (user_id = auth.uid());

-- Templates: own only
CREATE POLICY templates_all_own ON public.templates FOR ALL USING (user_id = auth.uid());

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, units)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', 'kg');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: profiles updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Seed data moved to supabase/seed.sql
