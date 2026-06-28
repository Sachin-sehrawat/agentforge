-- Agent favorites: lightweight bookmark, distinct from subscription.
-- favorite = "save for later"; subscription = "follow the live agent".
--
-- favorite_count on the agents table is maintained by atomic
-- increment / decrement inside the same transaction as the insert / delete,
-- so the counter stays consistent even under concurrent toggles.
--
-- Guard: only public agents (or agents owned by the caller) may be favorited.
-- The composite PRIMARY KEY (user_id, agent_id) prevents duplicates.

CREATE TABLE IF NOT EXISTS agent_favorites (
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);

-- Supports: "list all agents this user has favorited" ordered by recency.
CREATE INDEX IF NOT EXISTS idx_favorites_user ON agent_favorites (user_id, created_at DESC);

ANALYZE agent_favorites;
