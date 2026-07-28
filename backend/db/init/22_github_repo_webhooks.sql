CREATE TABLE IF NOT EXISTS github_repo_webhooks (
  repo_full_name   TEXT        PRIMARY KEY,
  secret_encrypted BYTEA       NOT NULL,
  hook_id          BIGINT      NOT NULL,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
