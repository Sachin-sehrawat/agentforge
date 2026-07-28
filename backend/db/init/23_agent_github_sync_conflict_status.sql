ALTER TABLE agent_github_sync DROP CONSTRAINT IF EXISTS agent_github_sync_last_sync_status_check;
ALTER TABLE agent_github_sync ADD CONSTRAINT agent_github_sync_last_sync_status_check
  CHECK (last_sync_status IN ('pending', 'ok', 'error', 'conflict'));
