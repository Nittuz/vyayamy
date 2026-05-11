-- 00006_plan_presets.sql
--
-- Preset library for the Plan Setup wizard. Four public-readable tables
-- that ship with the app (seeded in a later migration) and are pulled
-- down to every client by the existing sync engine.
--
-- Presets are catalog content: SELECT-only for authenticated users.
-- Writes happen only via service-role migrations. Picking a preset in
-- the UI never mutates these tables; it clones into the user-scoped
-- exercises / templates / training_plans / training_plan_slots tables
-- (see saveActivePlan + applyPresetAndSavePlan in the client).
--
-- Tier ('generic' | 'program') groups presets visually in the wizard:
--   - 'generic' — broadly applicable patterns (Full Body 3x, PPL, etc.)
--   - 'program' — bespoke prescription-heavy programs that read inline
--                 in the exercise name (cf. 00005 Beyond Strength seed).

CREATE TABLE public.plan_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('generic', 'program')),
  blurb TEXT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('weekly', 'cycle')),
  cycle_length INT CHECK (cycle_length IS NULL OR cycle_length > 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.plan_preset_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_id UUID NOT NULL REFERENCES public.plan_presets(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (preset_id, slug)
);

CREATE TABLE public.plan_preset_exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_template_id UUID NOT NULL REFERENCES public.plan_preset_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT CHECK (
    muscle_group IS NULL OR muscle_group IN (
      'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full Body', 'Cardio', 'Other'
    )
  ),
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.plan_preset_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_id UUID NOT NULL REFERENCES public.plan_presets(id) ON DELETE CASCADE,
  preset_template_id UUID REFERENCES public.plan_preset_templates(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  cycle_position INT CHECK (cycle_position IS NULL OR cycle_position >= 0),
  is_rest_day BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (day_of_week IS NOT NULL AND cycle_position IS NULL)
    OR (day_of_week IS NULL AND cycle_position IS NOT NULL)
  ),
  CHECK (is_rest_day OR preset_template_id IS NOT NULL)
);

-- One slot per weekday / cycle position per preset (mirrors training_plan_slots).
CREATE UNIQUE INDEX idx_plan_preset_slots_weekly_unique
  ON public.plan_preset_slots (preset_id, day_of_week)
  WHERE day_of_week IS NOT NULL;

CREATE UNIQUE INDEX idx_plan_preset_slots_cycle_unique
  ON public.plan_preset_slots (preset_id, cycle_position)
  WHERE cycle_position IS NOT NULL;

-- Lookup + sync indices
CREATE INDEX idx_plan_preset_templates_preset ON public.plan_preset_templates(preset_id);
CREATE INDEX idx_plan_preset_exercises_template ON public.plan_preset_exercises(preset_template_id);
CREATE INDEX idx_plan_preset_slots_preset ON public.plan_preset_slots(preset_id);

CREATE INDEX idx_plan_presets_updated_at           ON public.plan_presets(updated_at);
CREATE INDEX idx_plan_preset_templates_updated_at  ON public.plan_preset_templates(updated_at);
CREATE INDEX idx_plan_preset_exercises_updated_at  ON public.plan_preset_exercises(updated_at);
CREATE INDEX idx_plan_preset_slots_updated_at      ON public.plan_preset_slots(updated_at);

-- updated_at triggers (reuse the function defined in 00001)
CREATE TRIGGER plan_presets_updated_at
  BEFORE UPDATE ON public.plan_presets
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER plan_preset_templates_updated_at
  BEFORE UPDATE ON public.plan_preset_templates
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER plan_preset_exercises_updated_at
  BEFORE UPDATE ON public.plan_preset_exercises
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER plan_preset_slots_updated_at
  BEFORE UPDATE ON public.plan_preset_slots
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RLS: read-only catalog. Authenticated users can SELECT; no INSERT/UPDATE/DELETE
-- policies are defined, so the only writer is the service role (migrations / seeds).
ALTER TABLE public.plan_presets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_preset_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_preset_exercises  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_preset_slots      ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_presets_select ON public.plan_presets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_preset_templates_select ON public.plan_preset_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_preset_exercises_select ON public.plan_preset_exercises
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_preset_slots_select ON public.plan_preset_slots
  FOR SELECT TO authenticated USING (true);
