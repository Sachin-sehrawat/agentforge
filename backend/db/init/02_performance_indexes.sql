-- Performance indexes for AgentForge
-- Runs automatically on first container start (after 01_schema.sql).
-- For existing deployments, run manually: psql -U agentforge -d agentforge -f 02_performance_indexes.sql

-- GIN index on agents.tools JSONB — speeds up @> (containment) queries
-- e.g. "find all agents that use the calculator tool"
CREATE INDEX IF NOT EXISTS idx_agents_tools_gin
  ON agents USING GIN (tools jsonb_path_ops);

-- GIN index on agents.skills JSONB — same pattern for skill-based lookups
CREATE INDEX IF NOT EXISTS idx_agents_skills_gin
  ON agents USING GIN (skills jsonb_path_ops);

-- Index on agents.model — supports analytics queries and future filtering
-- "Which agents use which model?" is a common admin/reporting query
CREATE INDEX IF NOT EXISTS idx_agents_model
  ON agents (model);

-- Partial index on agents.name for fast text-prefix search (case-sensitive)
-- Express query: SELECT * FROM agents WHERE name LIKE 'prefix%'
CREATE INDEX IF NOT EXISTS idx_agents_name_text
  ON agents USING BTREE (name text_pattern_ops);

-- Composite index for custom_skills label lookup (case-sensitive exact match)
CREATE INDEX IF NOT EXISTS idx_custom_skills_label
  ON custom_skills (label);

-- ANALYZE both tables so the query planner picks up the new indexes
ANALYZE agents;
ANALYZE custom_skills;
