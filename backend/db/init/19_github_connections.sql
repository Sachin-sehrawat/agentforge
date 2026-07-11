CREATE TABLE IF NOT EXISTS github_connections (
  user_id                UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_login           TEXT        NOT NULL,
  access_token_encrypted BYTEA       NOT NULL,
  scopes                 TEXT,
  connected_at           TIMESTAMPTZ DEFAULT NOW()
);
