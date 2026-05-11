-- 00008_seed_plan_presets.sql
--
-- Seeds the five v1 plan presets:
--   Tier 'generic':
--     - Full Body 3×
--     - Upper / Lower 4-day
--     - Push / Pull / Legs (6-day)
--     - Bro Split (4-day)
--   Tier 'program':
--     - Beyond Strength 2026 — Capacity, Phase 1
--       (Depersonalised port of 00005. The original migration seeded
--        per-user exercises for nittuz4@gmail.com directly. Here the
--        same content lives as preset rows so any user can clone it
--        via the PlanSetup wizard. Exercise resolution at apply-time
--        will reuse nittuz4's existing rows by name match.)
--
-- Day index convention (matches src/screens/PlanSetup.tsx DAY_LABELS):
--   0 Sun · 1 Mon · 2 Tue · 3 Wed · 4 Thu · 5 Fri · 6 Sat
--
-- Idempotent: bails out early if any preset row already exists, so
-- `supabase db reset --local` and re-applies of an existing migration
-- both behave.

DO $$
DECLARE
  v_preset_id        UUID;
  v_t_full           UUID;
  v_t_upper          UUID;
  v_t_lower          UUID;
  v_t_push           UUID;
  v_t_pull           UUID;
  v_t_legs           UUID;
  v_t_chest          UUID;
  v_t_back           UUID;
  v_t_brolegs        UUID;
  v_t_sharms         UUID;
  v_t_sa             UUID;
  v_t_sb             UUID;
  v_t_he             UUID;
  v_t_sc             UUID;
  v_t_sd             UUID;
  v_t_sat            UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.plan_presets) THEN
    RAISE NOTICE 'plan_presets already seeded; skipping.';
    RETURN;
  END IF;

  -- =====================================================================
  -- Preset 1: Full Body 3×  (Mon / Wed / Fri)
  -- =====================================================================
  v_preset_id := uuid_generate_v4();
  v_t_full    := uuid_generate_v4();

  INSERT INTO public.plan_presets (id, slug, name, tier, blurb, plan_type, sort_order) VALUES
    (v_preset_id, 'full-body-3x', 'Full Body 3×', 'generic',
     'Three full-body sessions a week. Best for beginners or time-constrained lifters.',
     'weekly', 10);

  INSERT INTO public.plan_preset_templates (id, preset_id, slug, name, sort_order) VALUES
    (v_t_full, v_preset_id, 'full-body', 'Full Body', 0);

  INSERT INTO public.plan_preset_exercises (preset_template_id, name, muscle_group, order_index) VALUES
    (v_t_full, 'Back Squat',         'Legs',  0),
    (v_t_full, 'Bench Press',        'Chest', 1),
    (v_t_full, 'Bent-Over Row',      'Back',  2),
    (v_t_full, 'Overhead Press',     'Shoulders', 3),
    (v_t_full, 'Romanian Deadlift',  'Legs',  4);

  INSERT INTO public.plan_preset_slots (preset_id, preset_template_id, day_of_week, is_rest_day) VALUES
    (v_preset_id, NULL,    0, true),
    (v_preset_id, v_t_full, 1, false),
    (v_preset_id, NULL,    2, true),
    (v_preset_id, v_t_full, 3, false),
    (v_preset_id, NULL,    4, true),
    (v_preset_id, v_t_full, 5, false),
    (v_preset_id, NULL,    6, true);

  -- =====================================================================
  -- Preset 2: Upper / Lower 4-day  (Mon U / Tue L / Thu U / Fri L)
  -- =====================================================================
  v_preset_id := uuid_generate_v4();
  v_t_upper   := uuid_generate_v4();
  v_t_lower   := uuid_generate_v4();

  INSERT INTO public.plan_presets (id, slug, name, tier, blurb, plan_type, sort_order) VALUES
    (v_preset_id, 'upper-lower-4x', 'Upper / Lower', 'generic',
     'Alternating upper- and lower-body days, four sessions a week.',
     'weekly', 20);

  INSERT INTO public.plan_preset_templates (id, preset_id, slug, name, sort_order) VALUES
    (v_t_upper, v_preset_id, 'upper', 'Upper', 0),
    (v_t_lower, v_preset_id, 'lower', 'Lower', 1);

  INSERT INTO public.plan_preset_exercises (preset_template_id, name, muscle_group, order_index) VALUES
    -- Upper
    (v_t_upper, 'Bench Press',       'Chest', 0),
    (v_t_upper, 'Bent-Over Row',     'Back',  1),
    (v_t_upper, 'Overhead Press',    'Shoulders', 2),
    (v_t_upper, 'Pull-Up',           'Back',  3),
    (v_t_upper, 'Bicep Curl',        'Arms',  4),
    (v_t_upper, 'Tricep Pushdown',   'Arms',  5),
    -- Lower
    (v_t_lower, 'Back Squat',         'Legs', 0),
    (v_t_lower, 'Romanian Deadlift',  'Legs', 1),
    (v_t_lower, 'Walking Lunge',      'Legs', 2),
    (v_t_lower, 'Calf Raise',         'Legs', 3),
    (v_t_lower, 'Hanging Leg Raise',  'Core', 4);

  INSERT INTO public.plan_preset_slots (preset_id, preset_template_id, day_of_week, is_rest_day) VALUES
    (v_preset_id, NULL,    0, true),
    (v_preset_id, v_t_upper, 1, false),
    (v_preset_id, v_t_lower, 2, false),
    (v_preset_id, NULL,    3, true),
    (v_preset_id, v_t_upper, 4, false),
    (v_preset_id, v_t_lower, 5, false),
    (v_preset_id, NULL,    6, true);

  -- =====================================================================
  -- Preset 3: Push / Pull / Legs  (6-day, Mon–Sat)
  -- =====================================================================
  v_preset_id := uuid_generate_v4();
  v_t_push    := uuid_generate_v4();
  v_t_pull    := uuid_generate_v4();
  v_t_legs    := uuid_generate_v4();

  INSERT INTO public.plan_presets (id, slug, name, tier, blurb, plan_type, sort_order) VALUES
    (v_preset_id, 'push-pull-legs-6x', 'Push / Pull / Legs', 'generic',
     'Hypertrophy-focused six-day split. Each muscle group twice a week.',
     'weekly', 30);

  INSERT INTO public.plan_preset_templates (id, preset_id, slug, name, sort_order) VALUES
    (v_t_push, v_preset_id, 'push', 'Push', 0),
    (v_t_pull, v_preset_id, 'pull', 'Pull', 1),
    (v_t_legs, v_preset_id, 'legs', 'Legs', 2);

  INSERT INTO public.plan_preset_exercises (preset_template_id, name, muscle_group, order_index) VALUES
    -- Push
    (v_t_push, 'Bench Press',             'Chest',     0),
    (v_t_push, 'Overhead Press',          'Shoulders', 1),
    (v_t_push, 'Incline Dumbbell Press',  'Chest',     2),
    (v_t_push, 'Lateral Raise',           'Shoulders', 3),
    (v_t_push, 'Tricep Pushdown',         'Arms',      4),
    -- Pull
    (v_t_pull, 'Pull-Up',                 'Back',      0),
    (v_t_pull, 'Bent-Over Row',           'Back',      1),
    (v_t_pull, 'Lat Pulldown',            'Back',      2),
    (v_t_pull, 'Face Pull',               'Back',      3),
    (v_t_pull, 'Bicep Curl',              'Arms',      4),
    -- Legs
    (v_t_legs, 'Back Squat',              'Legs',      0),
    (v_t_legs, 'Romanian Deadlift',       'Legs',      1),
    (v_t_legs, 'Walking Lunge',           'Legs',      2),
    (v_t_legs, 'Leg Press',               'Legs',      3),
    (v_t_legs, 'Calf Raise',              'Legs',      4);

  INSERT INTO public.plan_preset_slots (preset_id, preset_template_id, day_of_week, is_rest_day) VALUES
    (v_preset_id, NULL,    0, true),
    (v_preset_id, v_t_push, 1, false),
    (v_preset_id, v_t_pull, 2, false),
    (v_preset_id, v_t_legs, 3, false),
    (v_preset_id, v_t_push, 4, false),
    (v_preset_id, v_t_pull, 5, false),
    (v_preset_id, v_t_legs, 6, false);

  -- =====================================================================
  -- Preset 4: Bro Split  (4-day, Mon–Thu)
  -- =====================================================================
  v_preset_id := uuid_generate_v4();
  v_t_chest   := uuid_generate_v4();
  v_t_back    := uuid_generate_v4();
  v_t_brolegs := uuid_generate_v4();
  v_t_sharms  := uuid_generate_v4();

  INSERT INTO public.plan_presets (id, slug, name, tier, blurb, plan_type, sort_order) VALUES
    (v_preset_id, 'bro-split-4x', 'Bro Split', 'generic',
     'One body part a day. Classic bodybuilding split.',
     'weekly', 40);

  INSERT INTO public.plan_preset_templates (id, preset_id, slug, name, sort_order) VALUES
    (v_t_chest,   v_preset_id, 'chest',           'Chest',             0),
    (v_t_back,    v_preset_id, 'back',            'Back',              1),
    (v_t_brolegs, v_preset_id, 'legs',            'Legs',              2),
    (v_t_sharms,  v_preset_id, 'shoulders-arms',  'Shoulders + Arms',  3);

  INSERT INTO public.plan_preset_exercises (preset_template_id, name, muscle_group, order_index) VALUES
    -- Chest
    (v_t_chest, 'Bench Press',             'Chest', 0),
    (v_t_chest, 'Incline Dumbbell Press',  'Chest', 1),
    (v_t_chest, 'Push-Up',                 'Chest', 2),
    (v_t_chest, 'Tricep Pushdown',         'Arms',  3),
    -- Back
    (v_t_back,  'Pull-Up',           'Back', 0),
    (v_t_back,  'Bent-Over Row',     'Back', 1),
    (v_t_back,  'Lat Pulldown',      'Back', 2),
    (v_t_back,  'Face Pull',         'Back', 3),
    (v_t_back,  'Bicep Curl',        'Arms', 4),
    -- Legs
    (v_t_brolegs, 'Back Squat',         'Legs', 0),
    (v_t_brolegs, 'Romanian Deadlift',  'Legs', 1),
    (v_t_brolegs, 'Leg Press',          'Legs', 2),
    (v_t_brolegs, 'Walking Lunge',      'Legs', 3),
    (v_t_brolegs, 'Calf Raise',         'Legs', 4),
    -- Shoulders + Arms
    (v_t_sharms, 'Overhead Press',    'Shoulders', 0),
    (v_t_sharms, 'Lateral Raise',     'Shoulders', 1),
    (v_t_sharms, 'Bicep Curl',        'Arms',      2),
    (v_t_sharms, 'Tricep Pushdown',   'Arms',      3);

  INSERT INTO public.plan_preset_slots (preset_id, preset_template_id, day_of_week, is_rest_day) VALUES
    (v_preset_id, NULL,       0, true),
    (v_preset_id, v_t_chest,   1, false),
    (v_preset_id, v_t_back,    2, false),
    (v_preset_id, v_t_brolegs, 3, false),
    (v_preset_id, v_t_sharms,  4, false),
    (v_preset_id, NULL,       5, true),
    (v_preset_id, NULL,       6, true);

  -- =====================================================================
  -- Preset 5: Beyond Strength 2026 — Capacity, Phase 1  (program tier)
  -- =====================================================================
  v_preset_id := uuid_generate_v4();
  v_t_sa  := uuid_generate_v4();
  v_t_sb  := uuid_generate_v4();
  v_t_he  := uuid_generate_v4();
  v_t_sc  := uuid_generate_v4();
  v_t_sd  := uuid_generate_v4();
  v_t_sat := uuid_generate_v4();

  INSERT INTO public.plan_presets (id, slug, name, tier, blurb, plan_type, sort_order) VALUES
    (v_preset_id, 'beyond-strength-2026-capacity-p1',
     'Beyond Strength 2026 — Capacity, Phase 1', 'program',
     'Four-week capacity block. Strength A/B/C/D + Hyrox Endurance + Saturday vigor day.',
     'weekly', 100);

  INSERT INTO public.plan_preset_templates (id, preset_id, slug, name, sort_order) VALUES
    (v_t_sa,  v_preset_id, 'strength-a',       'Strength A',       0),
    (v_t_sb,  v_preset_id, 'strength-b',       'Strength B',       1),
    (v_t_he,  v_preset_id, 'hyrox-endurance',  'Hyrox Endurance',  2),
    (v_t_sc,  v_preset_id, 'strength-c',       'Strength C',       3),
    (v_t_sd,  v_preset_id, 'strength-d',       'Strength D',       4),
    (v_t_sat, v_preset_id, 'saturday',         'Saturday (Hyrox Vigor / Long Run)', 5);

  -- Names mirror 00005 verbatim so nittuz4's existing exercises resolve by name match.
  INSERT INTO public.plan_preset_exercises (preset_template_id, name, muscle_group, order_index) VALUES
    -- Strength A
    (v_t_sa, 'SA·A1 — Cyclical Power EMOM (Rower) · W1 6×:08 · W2 :10 · W3 :12 · W4 :08 · RPE 10 — record top wattage', 'Cardio', 0),
    (v_t_sa, 'SA·B1 — Tempo Squat: Goblet · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 (3 rounds) · 2-4 RIR · 2X2X', 'Legs', 1),
    (v_t_sa, 'SA·C1 — Lower Pull Iso: KB Deadlift · 3×:30/:30 · RPE 7-8', 'Legs', 2),
    (v_t_sa, 'SA·C2 — Lower Push Iso: Lateral Goblet Squat · 3×:30/:30 · RPE 7-8', 'Legs', 3),
    (v_t_sa, 'SA·C3 — Lower Push Iso (other side) · 3×:30/:30 · RPE 7-8', 'Legs', 4),
    (v_t_sa, 'SA·D1 — Tempo Intervals (Rower) · W1/W4 10-12×:10/1:00 · W2 :12 · W3 :15 · @75-80% top · RPE 7-8', 'Cardio', 5),
    (v_t_sa, 'SA·E1 — Easy Erg Cardio (or Aerobic Interval Run) · 30-45min · HR 175-age ±5 · RPE 5-6', 'Cardio', 6),

    -- Strength B
    (v_t_sb, 'SB·A1 — Aerobic Plyo: Lower Body Plyo Series 5yds (Forward Jumps · Lateral Scissor · SL Double Hops · Bounds) · W1/W4 4:00 · W2 4:30 · W3 5:00 · RPE 6', 'Full Body', 0),
    (v_t_sb, 'SB·B1 — Tempo Row: Chest-Supported DB Row · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 (3 rounds) · 1-3 RIR · 2X2X tempo', 'Back', 1),
    (v_t_sb, 'SB·C1 — Upper Push: DB Bench Press · 10:00 × sets of 3 · 3-4 RIR · Eustress (HR<150 or nasal breathing)', 'Chest', 2),
    (v_t_sb, 'SB·C2 — Upper Pull: Inverted Row · 10:00 × sets of 3 · 3-4 RIR', 'Back', 3),
    (v_t_sb, 'SB·D1 — Easy Cyclical Cardio · 10-30min · HR 175-age ±5 · RPE 5-6', 'Cardio', 4),
    (v_t_sb, 'SB·E1 — Easy Run · 30-45min · HR ≤180-age · RPE 3-4', 'Cardio', 5),

    -- Hyrox Endurance
    (v_t_he, 'Hyrox·E·A1 — Ski Erg · 4:00/1:00 · RPE 5-6', 'Cardio', 0),
    (v_t_he, 'Hyrox·E·B1 — Sled Push · 4:00/1:00 · RPE 5-6', 'Full Body', 1),
    (v_t_he, 'Hyrox·E·C1 — Sled Pull · 4:00/1:00 · RPE 5-6', 'Full Body', 2),
    (v_t_he, 'Hyrox·E·D1 — Burpee Broad Jump · 4:00/1:00 · RPE 5-6', 'Full Body', 3),
    (v_t_he, 'Hyrox·E·E1 — Rower · 4:00/1:00 · RPE 5-6', 'Cardio', 4),
    (v_t_he, 'Hyrox·E·F1 — Farmer Carry · 4:00/1:00 · RPE 5-6', 'Full Body', 5),
    (v_t_he, 'Hyrox·E·G1 — Walking Lunges · 4:00/1:00 · RPE 5-6', 'Legs', 6),
    (v_t_he, 'Hyrox·E·H1 — Wall Ball · 4:00/1:00 · RPE 5-6', 'Full Body', 7),

    -- Strength C
    (v_t_sc, 'SC·A1 — Cyclical Power EMOM (Rower) · W1 6×:08 · W2 :10 · W3 :12 · W4 :08 · RPE 10', 'Cardio', 0),
    (v_t_sc, 'SC·B1 — Tempo RDL: KB RDL · W1 3×:40/:40 · W2-3 4×:32/:40 · W4 6:00×8 (3 rounds) · 2-4 RIR · 2X2X', 'Legs', 1),
    (v_t_sc, 'SC·C1 — Lower Push: Reverse Lunge · 10:00 × sets of 2 · 3-4 RIR · Eustress', 'Legs', 2),
    (v_t_sc, 'SC·C2 — Lower Pull: KB Deadlift · 10:00 × sets of 3 · 3-4 RIR', 'Legs', 3),
    (v_t_sc, 'SC·D1 — Tempo Intervals (Rower) · W1/W4 10-12×:10/1:00 · W2 :12 · W3 :15 · @75-80% top · RPE 7-8', 'Cardio', 4),
    (v_t_sc, 'SC·E1 — Easy Erg Cardio (or Tempo Intervals run 3-4×8:00/4:00) · 30-45min · RPE 5-6', 'Cardio', 5),

    -- Strength D
    (v_t_sd, 'SD·A1 — Aerobic Plyo: Lower Body Plyo Series 5yds · W1/W4 4:00 · W2 4:30 · W3 5:00 · RPE 6', 'Full Body', 0),
    (v_t_sd, 'SD·B1 — Tempo Press: Push-up · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 · 1-3 RIR · 2X2X', 'Chest', 1),
    (v_t_sd, 'SD·C1 — Upper Pull Iso: Bent Over DB Row Iso · 3×:30/:30 · RPE 7-8', 'Back', 2),
    (v_t_sd, 'SD·C2 — Upper Push Iso: Single Arm DB Bench Iso · 3×:30/:30 · RPE 7-8', 'Chest', 3),
    (v_t_sd, 'SD·C3 — Upper Push Iso (other side) · 3×:30/:30 · RPE 7-8', 'Chest', 4),
    (v_t_sd, 'SD·D1 — Easy Cyclical Cardio · 10-30min · RPE 5-6', 'Cardio', 5),
    (v_t_sd, 'SD·E1 — Easy Run · 45-60min · RPE 3-4', 'Cardio', 6),

    -- Saturday
    (v_t_sat, 'Sat·A1 — Easy Run (warmup) · 10-15min · RPE 3-4', 'Cardio', 0),
    (v_t_sat, 'Sat·B1 — Sled Pull · W1 3×25yd · W2 3×25yd · W3 2×50yd · W4 2×25yd · run .25mi between · RPE 7-8', 'Full Body', 1),
    (v_t_sat, 'Sat·B2 — Burpee Broad Jump · same yardage pattern · run .25mi between · RPE 7-8', 'Full Body', 2),
    (v_t_sat, 'Sat·B3 — Sandbag Walking Lunges · same yardage pattern · run .25mi between · RPE 7-8', 'Legs', 3),
    (v_t_sat, 'Sat·C1 — Wall Ball ×100 · RPE 7', 'Full Body', 4),
    (v_t_sat, 'Sat·OR — Easy Long Run · W1 75min · W2 90min · W3 1h45m · W4 60min · RPE 3-4', 'Cardio', 5);

  INSERT INTO public.plan_preset_slots (preset_id, preset_template_id, day_of_week, is_rest_day) VALUES
    (v_preset_id, NULL,  0, true),
    (v_preset_id, v_t_sa,  1, false),
    (v_preset_id, v_t_sb,  2, false),
    (v_preset_id, v_t_he,  3, false),
    (v_preset_id, v_t_sc,  4, false),
    (v_preset_id, v_t_sd,  5, false),
    (v_preset_id, v_t_sat, 6, false);

END $$;
