-- Subscriptions: reference semantics — a join row linking a user to a public agent.
--
-- Subscribing does NOT copy the agent. It stores a pointer (user_id, agent_id)
-- to the original public agent so the subscriber always sees the current version.
-- Unsubscribing deletes the row; the agent itself is unaffected.
-- If the agent is deleted, ON DELETE CASCADE removes all subscription rows for it.
-- If the user is deleted, ON DELETE CASCADE removes all their subscriptions.
--
-- The composite PRIMARY KEY (user_id, agent_id) enforces the uniqueness constraint
-- required to prevent duplicate subscriptions.

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);

-- Supports: "list all agents this user has subscribed to" (My Agents view)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id  ON subscriptions (user_id);

-- Supports: "list all subscribers for a given agent" (analytics / admin)
CREATE INDEX IF NOT EXISTS idx_subscriptions_agent_id ON subscriptions (agent_id);

ANALYZE subscriptions;
