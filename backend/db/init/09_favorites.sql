-- Per-user agent favorites: a join table recording which users have bookmarked
-- which agents. favorite_count on agents is maintained by POST/DELETE routes.
-- ON DELETE CASCADE keeps the table clean when users or agents are removed.

CREATE TABLE IF NOT EXISTS agent_favorites (
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);

-- Supports "list all agents favorited by this user" (Favorites tab)
CREATE INDEX IF NOT EXISTS idx_agent_favorites_user_id  ON agent_favorites (user_id);

-- Supports "count favorites for a given agent" (analytics)
CREATE INDEX IF NOT EXISTS idx_agent_favorites_agent_id ON agent_favorites (agent_id);

ANALYZE agent_favorites;
