-- Agent ratings: one row per (user, agent) pair; aggregates live on the agents table.
-- Runs after 07_marketplace.sql on a fresh volume.

CREATE TABLE IF NOT EXISTS agent_ratings (
  user_id    UUID     NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  agent_id   UUID     NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_ratings_agent_id ON agent_ratings (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_user_id  ON agent_ratings (user_id);

ANALYZE agent_ratings;
