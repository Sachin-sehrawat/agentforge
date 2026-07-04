CREATE TABLE audit_log (
  id                   BIGSERIAL PRIMARY KEY,
  actor_id             UUID,
  actor_email_snapshot TEXT,
  action               TEXT NOT NULL,
  entity_type          TEXT NOT NULL,
  entity_id            UUID NOT NULL,
  before               JSONB,
  after                JSONB,
  ip                   TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_log (actor_id, created_at DESC);

-- Deployment requirement: revoke UPDATE/DELETE on audit_log from the app role.
-- See docs/audit-log.md for details.
