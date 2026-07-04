-- Add is_admin flag to users table.
-- Safe to run multiple times (IF NOT EXISTS / idempotent default).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = TRUE;

ANALYZE users;
