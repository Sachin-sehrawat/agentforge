-- User tier and durable usage counters for quota enforcement.
-- Runs automatically on a fresh volume (after 12_seed_agents.sql).
-- For existing deployments, run manually: psql -U agentforge -d agentforge -f 13_tier.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CONSTRAINT users_tier_check CHECK (tier IN ('free', 'paid'));

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action   TEXT    NOT NULL,  -- 'export' | 'save'
  period   DATE    NOT NULL,  -- daily bucket: CURRENT_DATE at increment time
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, period)
);

-- Partial index speeds up per-user quota checks for today's bucket.
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_today
  ON usage_counters (user_id, action)
  WHERE period = CURRENT_DATE;

ANALYZE users;
ANALYZE usage_counters;
