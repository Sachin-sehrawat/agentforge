CREATE TABLE IF NOT EXISTS agent_github_sync (
  agent_id       UUID        PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  repo_full_name TEXT        NOT NULL,
  branch         TEXT        NOT NULL,
  path_template  TEXT        NOT NULL DEFAULT 'agents/{slug}.md',
  auto_sync      BOOLEAN     NOT NULL DEFAULT false,
  format         TEXT        NOT NULL DEFAULT 'markdown'
                             CHECK (format IN ('markdown', 'json', 'both')),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
