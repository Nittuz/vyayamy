/**
 * Local SQLite schema.
 *
 * Mirrors supabase/migrations Postgres schema 1:1 so the sync engine
 * stays boringly mechanical. UUIDs are stored as TEXT, timestamps as
 * ISO-8601 TEXT. Every mutable table has updated_at + deleted_at so
 * incremental pull and tombstone propagation work end-to-end.
 *
 * Two client-only tables:
 *   - outbox:    queue of pending mutations awaiting push
 *   - sync_meta: per-table high-water mark for incremental pull
 */

export const LOCAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT,
  units TEXT NOT NULL DEFAULT 'kg',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  title TEXT NOT NULL,
  template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_workouts_user_started ON workouts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_ended ON workouts(user_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_we_workout ON workout_exercises(workout_id);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY NOT NULL,
  workout_exercise_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  -- Unit the weight was logged in ('kg' | 'lb'). Per-set, so toggling the
  -- profile preference never reinterprets historical sets. Null only while a
  -- set is staged empty; stamped the moment a weight is written.
  units TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sets_we ON sets(workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_sets_completed_at
  ON sets(workout_exercise_id, completed_at)
  WHERE completed = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  achieved_at TEXT NOT NULL,
  workout_id TEXT,
  set_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_unique ON personal_records(user_id, exercise_id, type);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  exercise_order TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);

CREATE TABLE IF NOT EXISTS training_plans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  cycle_cursor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_training_plans_user ON training_plans(user_id);

CREATE TABLE IF NOT EXISTS training_plan_slots (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  template_id TEXT,
  day_of_week INTEGER,
  cycle_position INTEGER,
  is_rest_day INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tps_plan ON training_plan_slots(plan_id);

CREATE TABLE IF NOT EXISTS plan_presets (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  blurb TEXT,
  plan_type TEXT NOT NULL,
  cycle_length INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_presets_sort ON plan_presets(tier, sort_order);

CREATE TABLE IF NOT EXISTS plan_preset_templates (
  id TEXT PRIMARY KEY NOT NULL,
  preset_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppt_preset ON plan_preset_templates(preset_id);

CREATE TABLE IF NOT EXISTS plan_preset_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  preset_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppe_template ON plan_preset_exercises(preset_template_id);

CREATE TABLE IF NOT EXISTS plan_preset_slots (
  id TEXT PRIMARY KEY NOT NULL,
  preset_id TEXT NOT NULL,
  preset_template_id TEXT,
  day_of_week INTEGER,
  cycle_position INTEGER,
  is_rest_day INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pps_preset ON plan_preset_slots(preset_id);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  op TEXT NOT NULL,
  row_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt ON outbox(next_attempt_at);

CREATE TABLE IF NOT EXISTS sync_meta (
  table_name TEXT PRIMARY KEY NOT NULL,
  last_pulled_at TEXT,
  last_pulled_id TEXT
);
`;

// personal_records is intentionally NOT synced — it is a LOCAL derived cache
// recomputed from sets (which do sync). See src/queries/personalRecords.ts (#138–145).
export const SYNCED_TABLES = [
  'profiles',
  'exercises',
  'workouts',
  'workout_exercises',
  'sets',
  'templates',
  'training_plans',
  'training_plan_slots',
  'plan_presets',
  'plan_preset_templates',
  'plan_preset_exercises',
  'plan_preset_slots',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];
