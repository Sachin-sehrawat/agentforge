-- Users table for AgentForge authentication
-- Runs automatically on first container start (after 02_performance_indexes.sql).
-- For existing deployments, run manually: psql -U agentforge -d agentforge -f 03_users.sql

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL DEFAULT '',
  auth_provider TEXT        NOT NULL DEFAULT 'local',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enforce that email is already trimmed and lowercased before insert/update
  CONSTRAINT users_email_normalized CHECK (email = LOWER(TRIM(email)))
);

-- Unique index on lowercased email supports case-insensitive lookups
-- (redundant for uniqueness given the check constraint, but makes the intent
-- explicit and allows the query planner to use it for LOWER(email) predicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users (auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_created_at    ON users (created_at DESC);

ANALYZE users;
