-- Phase post-audit: perf indexes for PR history queries.
-- The heaviest-weight history join scans sets by workout_exercise_id +
-- completed_at; without this index it table-scans as workout count grows.

CREATE INDEX IF NOT EXISTS idx_sets_completed_at
  ON sets(workout_exercise_id, completed_at)
  WHERE completed = TRUE AND deleted_at IS NULL;

-- Also index personal_records by achieved_at for recent-PR queries
CREATE INDEX IF NOT EXISTS idx_personal_records_achieved_at
  ON personal_records(user_id, achieved_at DESC)
  WHERE deleted_at IS NULL;
