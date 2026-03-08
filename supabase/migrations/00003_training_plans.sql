-- Training plans: schedule wrapper around templates
CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('weekly', 'cycle')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  cycle_cursor INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plan slots: each maps to a weekday or cycle position
CREATE TABLE public.training_plan_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  day_of_week INT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  cycle_position INT CHECK (cycle_position IS NULL OR cycle_position >= 0),
  is_rest_day BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_training_plans_user ON public.training_plans(user_id);
CREATE INDEX idx_training_plans_active ON public.training_plans(user_id) WHERE is_active = true;
CREATE INDEX idx_training_plan_slots_plan ON public.training_plan_slots(plan_id);

-- Unique constraints: one slot per weekday per plan, one slot per cycle position per plan
CREATE UNIQUE INDEX idx_plan_slots_weekly_unique
  ON public.training_plan_slots (plan_id, day_of_week)
  WHERE day_of_week IS NOT NULL;

CREATE UNIQUE INDEX idx_plan_slots_cycle_unique
  ON public.training_plan_slots (plan_id, cycle_position)
  WHERE cycle_position IS NOT NULL;

-- RLS
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_plans_all_own ON public.training_plans
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY training_plan_slots_all ON public.training_plan_slots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.training_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

-- Reuse existing set_updated_at trigger function
CREATE TRIGGER training_plans_updated_at
  BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
