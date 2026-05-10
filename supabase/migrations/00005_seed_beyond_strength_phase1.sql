-- 00005_seed_beyond_strength_phase1.sql
--
-- Seeds the "Beyond Strength 2026 — Capacity, Phase 1" program for a single
-- user (looked up by email below). Creates:
--   - 40 user-scoped exercises whose names embed the prescription
--     (set scheme, RPE/RIR, weekly progression) so the existing UI surfaces
--     it without any code changes.
--   - 6 templates (Strength A/B/C/D, Hyrox Endurance, Saturday) wired to those
--     exercises in order.
--
-- Wiring the templates onto specific weekdays (Mon→SA, Tue→SB, …) is left to
-- the user via Profile → Plan → Setup, since the active training_plan is a
-- per-user authoring surface that should not be silently mutated by a
-- migration. If the user is not present the migration is a no-op so
-- `supabase db reset --local` against an empty DB still succeeds.

DO $$
DECLARE
  v_user_id UUID;

  -- Strength A (7)
  v_sa_a1 UUID := uuid_generate_v4();
  v_sa_b1 UUID := uuid_generate_v4();
  v_sa_c1 UUID := uuid_generate_v4();
  v_sa_c2 UUID := uuid_generate_v4();
  v_sa_c3 UUID := uuid_generate_v4();
  v_sa_d1 UUID := uuid_generate_v4();
  v_sa_e1 UUID := uuid_generate_v4();

  -- Strength B (6)
  v_sb_a1 UUID := uuid_generate_v4();
  v_sb_b1 UUID := uuid_generate_v4();
  v_sb_c1 UUID := uuid_generate_v4();
  v_sb_c2 UUID := uuid_generate_v4();
  v_sb_d1 UUID := uuid_generate_v4();
  v_sb_e1 UUID := uuid_generate_v4();

  -- Hyrox Endurance (8)
  v_he_a1 UUID := uuid_generate_v4();
  v_he_b1 UUID := uuid_generate_v4();
  v_he_c1 UUID := uuid_generate_v4();
  v_he_d1 UUID := uuid_generate_v4();
  v_he_e1 UUID := uuid_generate_v4();
  v_he_f1 UUID := uuid_generate_v4();
  v_he_g1 UUID := uuid_generate_v4();
  v_he_h1 UUID := uuid_generate_v4();

  -- Strength C (6)
  v_sc_a1 UUID := uuid_generate_v4();
  v_sc_b1 UUID := uuid_generate_v4();
  v_sc_c1 UUID := uuid_generate_v4();
  v_sc_c2 UUID := uuid_generate_v4();
  v_sc_d1 UUID := uuid_generate_v4();
  v_sc_e1 UUID := uuid_generate_v4();

  -- Strength D (7) -- PDF labels Friday "Strength C" but it's a distinct
  -- workout from Thursday's. Renamed to "D" in-app to disambiguate.
  v_sd_a1 UUID := uuid_generate_v4();
  v_sd_b1 UUID := uuid_generate_v4();
  v_sd_c1 UUID := uuid_generate_v4();
  v_sd_c2 UUID := uuid_generate_v4();
  v_sd_c3 UUID := uuid_generate_v4();
  v_sd_d1 UUID := uuid_generate_v4();
  v_sd_e1 UUID := uuid_generate_v4();

  -- Saturday (6)
  v_st_a1 UUID := uuid_generate_v4();
  v_st_b1 UUID := uuid_generate_v4();
  v_st_b2 UUID := uuid_generate_v4();
  v_st_b3 UUID := uuid_generate_v4();
  v_st_c1 UUID := uuid_generate_v4();
  v_st_or UUID := uuid_generate_v4();
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'nittuz4@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Beyond Strength seed: user nittuz4@gmail.com not found; skipping.';
    RETURN;
  END IF;

  -- Exercises: prescription-in-name. The existing UI shows `name` directly,
  -- so the set scheme reads inline on the WorkoutActive screen.
  INSERT INTO public.exercises (id, name, muscle_group, user_id) VALUES
    -- Strength A
    (v_sa_a1, 'SA·A1 — Cyclical Power EMOM (Rower) · W1 6×:08 · W2 :10 · W3 :12 · W4 :08 · RPE 10 — record top wattage', 'Cardio', v_user_id),
    (v_sa_b1, 'SA·B1 — Tempo Squat: Goblet · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 (3 rounds) · 2-4 RIR · 2X2X', 'Legs', v_user_id),
    (v_sa_c1, 'SA·C1 — Lower Pull Iso: KB Deadlift · 3×:30/:30 · RPE 7-8', 'Legs', v_user_id),
    (v_sa_c2, 'SA·C2 — Lower Push Iso: Lateral Goblet Squat · 3×:30/:30 · RPE 7-8', 'Legs', v_user_id),
    (v_sa_c3, 'SA·C3 — Lower Push Iso (other side) · 3×:30/:30 · RPE 7-8', 'Legs', v_user_id),
    (v_sa_d1, 'SA·D1 — Tempo Intervals (Rower) · W1/W4 10-12×:10/1:00 · W2 :12 · W3 :15 · @75-80% top · RPE 7-8', 'Cardio', v_user_id),
    (v_sa_e1, 'SA·E1 — Easy Erg Cardio (or Aerobic Interval Run) · 30-45min · HR 175-age ±5 · RPE 5-6', 'Cardio', v_user_id),

    -- Strength B
    (v_sb_a1, 'SB·A1 — Aerobic Plyo: Lower Body Plyo Series 5yds (Forward Jumps · Lateral Scissor · SL Double Hops · Bounds) · W1/W4 4:00 · W2 4:30 · W3 5:00 · RPE 6', 'Full Body', v_user_id),
    (v_sb_b1, 'SB·B1 — Tempo Row: Chest-Supported DB Row · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 (3 rounds) · 1-3 RIR · 2X2X tempo', 'Back', v_user_id),
    (v_sb_c1, 'SB·C1 — Upper Push: DB Bench Press · 10:00 × sets of 3 · 3-4 RIR · Eustress (HR<150 or nasal breathing)', 'Chest', v_user_id),
    (v_sb_c2, 'SB·C2 — Upper Pull: Inverted Row · 10:00 × sets of 3 · 3-4 RIR', 'Back', v_user_id),
    (v_sb_d1, 'SB·D1 — Easy Cyclical Cardio · 10-30min · HR 175-age ±5 · RPE 5-6', 'Cardio', v_user_id),
    (v_sb_e1, 'SB·E1 — Easy Run · 30-45min · HR ≤180-age · RPE 3-4', 'Cardio', v_user_id),

    -- Hyrox Endurance — all stations 4:00/1:00, RPE 5-6, conversational pace
    (v_he_a1, 'Hyrox·E·A1 — Ski Erg · 4:00/1:00 · RPE 5-6', 'Cardio', v_user_id),
    (v_he_b1, 'Hyrox·E·B1 — Sled Push · 4:00/1:00 · RPE 5-6', 'Full Body', v_user_id),
    (v_he_c1, 'Hyrox·E·C1 — Sled Pull · 4:00/1:00 · RPE 5-6', 'Full Body', v_user_id),
    (v_he_d1, 'Hyrox·E·D1 — Burpee Broad Jump · 4:00/1:00 · RPE 5-6', 'Full Body', v_user_id),
    (v_he_e1, 'Hyrox·E·E1 — Rower · 4:00/1:00 · RPE 5-6', 'Cardio', v_user_id),
    (v_he_f1, 'Hyrox·E·F1 — Farmer Carry · 4:00/1:00 · RPE 5-6', 'Full Body', v_user_id),
    (v_he_g1, 'Hyrox·E·G1 — Walking Lunges · 4:00/1:00 · RPE 5-6', 'Legs', v_user_id),
    (v_he_h1, 'Hyrox·E·H1 — Wall Ball · 4:00/1:00 · RPE 5-6', 'Full Body', v_user_id),

    -- Strength C
    (v_sc_a1, 'SC·A1 — Cyclical Power EMOM (Rower) · W1 6×:08 · W2 :10 · W3 :12 · W4 :08 · RPE 10', 'Cardio', v_user_id),
    (v_sc_b1, 'SC·B1 — Tempo RDL: KB RDL · W1 3×:40/:40 · W2-3 4×:32/:40 · W4 6:00×8 (3 rounds) · 2-4 RIR · 2X2X', 'Legs', v_user_id),
    (v_sc_c1, 'SC·C1 — Lower Push: Reverse Lunge · 10:00 × sets of 2 · 3-4 RIR · Eustress', 'Legs', v_user_id),
    (v_sc_c2, 'SC·C2 — Lower Pull: KB Deadlift · 10:00 × sets of 3 · 3-4 RIR', 'Legs', v_user_id),
    (v_sc_d1, 'SC·D1 — Tempo Intervals (Rower) · W1/W4 10-12×:10/1:00 · W2 :12 · W3 :15 · @75-80% top · RPE 7-8', 'Cardio', v_user_id),
    (v_sc_e1, 'SC·E1 — Easy Erg Cardio (or Tempo Intervals run 3-4×8:00/4:00) · 30-45min · RPE 5-6', 'Cardio', v_user_id),

    -- Strength D
    (v_sd_a1, 'SD·A1 — Aerobic Plyo: Lower Body Plyo Series 5yds · W1/W4 4:00 · W2 4:30 · W3 5:00 · RPE 6', 'Full Body', v_user_id),
    (v_sd_b1, 'SD·B1 — Tempo Press: Push-up · W1 3×:40/:40 (10/set) · W2-3 4×:32/:40 (8/set) · W4 6:00×8 · 1-3 RIR · 2X2X', 'Chest', v_user_id),
    (v_sd_c1, 'SD·C1 — Upper Pull Iso: Bent Over DB Row Iso · 3×:30/:30 · RPE 7-8', 'Back', v_user_id),
    (v_sd_c2, 'SD·C2 — Upper Push Iso: Single Arm DB Bench Iso · 3×:30/:30 · RPE 7-8', 'Chest', v_user_id),
    (v_sd_c3, 'SD·C3 — Upper Push Iso (other side) · 3×:30/:30 · RPE 7-8', 'Chest', v_user_id),
    (v_sd_d1, 'SD·D1 — Easy Cyclical Cardio · 10-30min · RPE 5-6', 'Cardio', v_user_id),
    (v_sd_e1, 'SD·E1 — Easy Run · 45-60min · RPE 3-4', 'Cardio', v_user_id),

    -- Saturday
    (v_st_a1, 'Sat·A1 — Easy Run (warmup) · 10-15min · RPE 3-4', 'Cardio', v_user_id),
    (v_st_b1, 'Sat·B1 — Sled Pull · W1 3×25yd · W2 3×25yd · W3 2×50yd · W4 2×25yd · run .25mi between · RPE 7-8', 'Full Body', v_user_id),
    (v_st_b2, 'Sat·B2 — Burpee Broad Jump · same yardage pattern · run .25mi between · RPE 7-8', 'Full Body', v_user_id),
    (v_st_b3, 'Sat·B3 — Sandbag Walking Lunges · same yardage pattern · run .25mi between · RPE 7-8', 'Legs', v_user_id),
    (v_st_c1, 'Sat·C1 — Wall Ball ×100 · RPE 7', 'Full Body', v_user_id),
    (v_st_or, 'Sat·OR — Easy Long Run · W1 75min · W2 90min · W3 1h45m · W4 60min · RPE 3-4', 'Cardio', v_user_id);

  -- Templates: ordered exercise_order arrays
  INSERT INTO public.templates (user_id, name, exercise_order) VALUES
    (v_user_id, 'Strength A',
      ARRAY[v_sa_a1, v_sa_b1, v_sa_c1, v_sa_c2, v_sa_c3, v_sa_d1, v_sa_e1]::UUID[]),
    (v_user_id, 'Strength B',
      ARRAY[v_sb_a1, v_sb_b1, v_sb_c1, v_sb_c2, v_sb_d1, v_sb_e1]::UUID[]),
    (v_user_id, 'Hyrox Endurance',
      ARRAY[v_he_a1, v_he_b1, v_he_c1, v_he_d1, v_he_e1, v_he_f1, v_he_g1, v_he_h1]::UUID[]),
    (v_user_id, 'Strength C',
      ARRAY[v_sc_a1, v_sc_b1, v_sc_c1, v_sc_c2, v_sc_d1, v_sc_e1]::UUID[]),
    (v_user_id, 'Strength D',
      ARRAY[v_sd_a1, v_sd_b1, v_sd_c1, v_sd_c2, v_sd_c3, v_sd_d1, v_sd_e1]::UUID[]),
    (v_user_id, 'Saturday (Hyrox Vigor / Long Run)',
      ARRAY[v_st_a1, v_st_b1, v_st_b2, v_st_b3, v_st_c1, v_st_or]::UUID[]);
END $$;
