-- Global exercises (user_id NULL = available to all users)
INSERT INTO public.exercises (id, name, muscle_group, user_id) VALUES
  (uuid_generate_v4(), 'Bench Press', 'Chest', NULL),
  (uuid_generate_v4(), 'Squat', 'Legs', NULL),
  (uuid_generate_v4(), 'Deadlift', 'Back', NULL),
  (uuid_generate_v4(), 'Overhead Press', 'Shoulders', NULL),
  (uuid_generate_v4(), 'Barbell Row', 'Back', NULL),
  (uuid_generate_v4(), 'Pull-up', 'Back', NULL),
  (uuid_generate_v4(), 'Dumbbell Row', 'Back', NULL),
  (uuid_generate_v4(), 'Incline Bench Press', 'Chest', NULL),
  (uuid_generate_v4(), 'Romanian Deadlift', 'Legs', NULL),
  (uuid_generate_v4(), 'Lunges', 'Legs', NULL),
  (uuid_generate_v4(), 'Lat Pulldown', 'Back', NULL),
  (uuid_generate_v4(), 'Dumbbell Curl', 'Arms', NULL),
  (uuid_generate_v4(), 'Tricep Pushdown', 'Arms', NULL),
  (uuid_generate_v4(), 'Leg Press', 'Legs', NULL),
  (uuid_generate_v4(), 'Dumbbell Shoulder Press', 'Shoulders', NULL);
