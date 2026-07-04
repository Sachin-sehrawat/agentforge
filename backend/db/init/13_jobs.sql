CREATE TABLE IF NOT EXISTS jobs (
  id              BIGSERIAL    PRIMARY KEY,
  type            TEXT         NOT NULL,
  payload         JSONB        NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts        INTEGER      NOT NULL DEFAULT 0,
  max_attempts    INTEGER      NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs (status, next_attempt_at)
  WHERE status IN ('pending', 'processing');
