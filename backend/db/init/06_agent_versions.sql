-- Agent version history
-- Stores an immutable snapshot of every agent on each save.
-- Runs after 01_schema.sql on a fresh volume; existing deployments
-- should apply the ALTER TABLE migration described in docs/migration-overview.md.

CREATE TABLE IF NOT EXISTS agent_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_no      INTEGER     NOT NULL,
  snapshot        JSONB       NOT NULL,
  change_summary  TEXT,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent
  ON agent_versions (agent_id, version_no DESC);

ANALYZE agent_versions;
