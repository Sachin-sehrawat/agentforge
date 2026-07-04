-- Agent category taxonomy
-- Admin-managed canonical categories for organizing agents.
-- Distinct from free-text `tags` (open-ended); categories are constrained/canonical.

CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        UNIQUE NOT NULL,
  label      TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (slug, label) VALUES
  ('marketing',       'Marketing'),
  ('support',         'Support'),
  ('research',        'Research'),
  ('productivity',    'Productivity'),
  ('education',       'Education'),
  ('developer-tools', 'Developer Tools')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category_id);

ANALYZE categories;
ANALYZE agents;
