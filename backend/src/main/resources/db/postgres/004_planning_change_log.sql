CREATE TABLE IF NOT EXISTS planning_change_log (
  id BIGSERIAL PRIMARY KEY,
  planning_id BIGINT NOT NULL REFERENCES planning(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  actor TEXT,
  suite_id BIGINT,
  test_point_id BIGINT,
  suite_name TEXT,
  field TEXT NOT NULL,
  alloc_date TEXT,
  old_value TEXT,
  new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_change_log_plan ON planning_change_log (planning_id, created_at DESC);
