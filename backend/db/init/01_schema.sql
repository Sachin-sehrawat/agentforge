-- AgentForge initial schema
-- PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_name       ON agents (name);
CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents (updated_at DESC);

CREATE TABLE IF NOT EXISTS custom_skills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  description TEXT        NOT NULL DEFAULT '',
  instruction TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
