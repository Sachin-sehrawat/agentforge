-- AgentForge complete schema
-- PostgreSQL 14+
--
-- This file is the authoritative baseline. All tables, columns, and indexes
-- needed by the application are defined here so a fresh `docker-compose up -d`
-- produces a fully functional database without any extra steps.
--
-- Files 02–05 in this directory are idempotent and run after this one on first
-- start; they are kept as standalone migration helpers for existing deployments.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL DEFAULT '',
  auth_provider TEXT        NOT NULL DEFAULT 'local',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_normalized CHECK (email = LOWER(TRIM(email)))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower    ON users (LOWER(email));
CREATE INDEX        IF NOT EXISTS idx_users_auth_provider  ON users (auth_provider);
CREATE INDEX        IF NOT EXISTS idx_users_created_at     ON users (created_at DESC);

-- Agents ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  persona       TEXT        NOT NULL DEFAULT '',
  system_prompt TEXT        NOT NULL DEFAULT '',
  model         TEXT        NOT NULL DEFAULT 'claude-sonnet-4-6',
  tools         JSONB       NOT NULL DEFAULT '[]',
  positions     JSONB       NOT NULL DEFAULT '{}',
  skills        JSONB       NOT NULL DEFAULT '[]',
  instructions  JSONB       NOT NULL DEFAULT '[]',
  owner_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  visibility    TEXT        NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('public', 'private')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_name         ON agents (name);
CREATE INDEX IF NOT EXISTS idx_agents_updated_at   ON agents (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_owner_id     ON agents (owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_visibility   ON agents (visibility);
CREATE INDEX IF NOT EXISTS idx_agents_model        ON agents (model);
CREATE INDEX IF NOT EXISTS idx_agents_name_text    ON agents USING BTREE (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_agents_tools_gin    ON agents USING GIN  (tools  jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_agents_skills_gin   ON agents USING GIN  (skills jsonb_path_ops);

-- Custom skills ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS custom_skills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  description TEXT        NOT NULL DEFAULT '',
  instruction TEXT        NOT NULL DEFAULT '',
  owner_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  visibility  TEXT        NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('public', 'private')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_skills_label      ON custom_skills (label);
CREATE INDEX IF NOT EXISTS idx_custom_skills_owner_id   ON custom_skills (owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_skills_visibility ON custom_skills (visibility);

-- Subscriptions ---------------------------------------------------------
-- A (user_id, agent_id) join row — subscribing does NOT copy the agent,
-- it stores a pointer so the subscriber always sees the live version.

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id  ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_agent_id ON subscriptions (agent_id);

ANALYZE users;
ANALYZE agents;
ANALYZE custom_skills;
ANALYZE subscriptions;
