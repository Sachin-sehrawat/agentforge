CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          BIGSERIAL    PRIMARY KEY,
  webhook_id  UUID         NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  job_id      BIGINT       REFERENCES jobs(id) ON DELETE SET NULL,
  event       TEXT         NOT NULL,
  agent_id    UUID,
  delivery_id TEXT         NOT NULL,
  attempt     INTEGER      NOT NULL,
  status_code INTEGER,
  error       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_job    ON webhook_deliveries(job_id);

ANALYZE webhook_deliveries;
