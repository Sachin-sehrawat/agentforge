-- Ownership and visibility for agents and custom_skills
-- PostgreSQL 14+ — safe to re-run (ADD COLUMN IF NOT EXISTS is idempotent).
--
-- Visibility strategy:
--   - Existing rows are backfilled to 'public' (column DEFAULT at creation time).
--   - The column default is then changed to 'private' so all new rows are private
--     until explicitly published by the owner.
--   - owner_id is nullable so legacy / seed rows that pre-date the users table
--     remain valid.

-- agents: owner reference (nullable for legacy rows)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- agents: visibility — DEFAULT 'public' backfills all existing rows as public
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));

-- Future inserts default to private
ALTER TABLE agents ALTER COLUMN visibility SET DEFAULT 'private';

-- custom_skills: owner reference (nullable for legacy rows)
ALTER TABLE custom_skills
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- custom_skills: visibility — same backfill strategy as agents
ALTER TABLE custom_skills
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));

-- Future inserts default to private
ALTER TABLE custom_skills ALTER COLUMN visibility SET DEFAULT 'private';

-- BTREE indexes on owner_id and visibility for both tables
CREATE INDEX IF NOT EXISTS idx_agents_owner_id         ON agents       (owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_visibility        ON agents       (visibility);
CREATE INDEX IF NOT EXISTS idx_custom_skills_owner_id   ON custom_skills (owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_skills_visibility  ON custom_skills (visibility);

ANALYZE agents;
ANALYZE custom_skills;
