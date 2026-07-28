ALTER TABLE agent_github_sync ADD COLUMN IF NOT EXISTS last_synced_commit_sha TEXT;
ALTER TABLE agent_github_sync ADD COLUMN IF NOT EXISTS last_synced_version_no INT;
ALTER TABLE agent_github_sync ADD COLUMN IF NOT EXISTS last_sync_status TEXT
  NOT NULL DEFAULT 'pending'
  CHECK (last_sync_status IN ('pending', 'ok', 'error'));
ALTER TABLE agent_github_sync ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
ALTER TABLE agent_github_sync ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
