-- Migration: agent_versions table
-- Idempotent — safe to run against both fresh and existing databases.

CREATE TABLE IF NOT EXISTS agent_versions (
  id             BIGSERIAL   PRIMARY KEY,
  agent_id       UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_no     INT         NOT NULL,
  canonical_hash TEXT        NOT NULL,
  snapshot       JSONB       NOT NULL,
  change_summary TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id
  ON agent_versions (agent_id, version_no DESC);

ANALYZE agent_versions;
