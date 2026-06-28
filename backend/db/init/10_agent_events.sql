-- Append-only event log for agent activity.
-- Powers owner analytics timelines and export count metrics.
--
-- Event types: subscribe | unsubscribe | favorite | unfavorite | fork | rate | export
-- meta JSONB carries type-specific payload (e.g. { rating: 4 } or { format: 'markdown' }).
-- actor_id is NULL for anonymous actions (e.g. unauthenticated exports).
-- Rows are never updated or deleted; cascaded deletes only occur when the agent is deleted.

CREATE TABLE IF NOT EXISTS agent_events (
  id         BIGSERIAL    PRIMARY KEY,
  agent_id   UUID         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  actor_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT         NOT NULL,
  meta       JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Supports: "show me the activity timeline for agent X, newest first"
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events (agent_id, created_at DESC);

ANALYZE agent_events;
