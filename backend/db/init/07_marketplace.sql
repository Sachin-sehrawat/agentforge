-- Marketplace columns: full-text search vector, aggregate counts, and fork lineage.
-- Runs after 01_schema.sql on a fresh volume; existing deployments
-- should apply the ALTER TABLE migration described in docs/migration-overview.md.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_tsv     tsvector;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS fork_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating_sum     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS forked_from    UUID REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_search_tsv     ON agents USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_agents_public_updated ON agents (updated_at DESC)
  WHERE visibility = 'public';

-- Maintain search_tsv from name (weight A), persona (weight B), system_prompt (weight C).
-- The trigger fires on every INSERT and on any UPDATE that touches these three columns,
-- covering the create, edit, and restore-from-version paths automatically.
CREATE OR REPLACE FUNCTION agents_search_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),          'A') ||
    setweight(to_tsvector('english', coalesce(NEW.persona, '')),        'B') ||
    setweight(to_tsvector('english', coalesce(NEW.system_prompt, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_search_tsv ON agents;
CREATE TRIGGER trg_agents_search_tsv
  BEFORE INSERT OR UPDATE OF name, persona, system_prompt ON agents
  FOR EACH ROW EXECUTE FUNCTION agents_search_tsv_update();

-- Back-fill any rows that existed before this script ran.
UPDATE agents
SET search_tsv =
  setweight(to_tsvector('english', coalesce(name, '')),          'A') ||
  setweight(to_tsvector('english', coalesce(persona, '')),        'B') ||
  setweight(to_tsvector('english', coalesce(system_prompt, '')), 'C')
WHERE search_tsv IS NULL;

ANALYZE agents;
