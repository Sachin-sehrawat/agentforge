# Migration Overview

This document describes the architectural migration of AgentForge from a single-file SQLite store to a dual-database production stack (PostgreSQL + MongoDB).

---

## Why We Migrated

| Driver | Detail |
|---|---|
| Concurrent writes | SQLite file locks under concurrent requests; PostgreSQL handles parallel connections safely |
| Structured querying | Agent filtering/sorting required SQL indexes; SQLite's row-level locking was a bottleneck |
| Operational data | User preferences and workspace state are ephemeral, high-write — MongoDB's document model fits better than a relational table |
| Production readiness | Docker-native PostgreSQL and MongoDB give us connection pooling, health checks, and standard tooling out of the box |

---

## Migration Phases

### Phase 1 — Infrastructure (completed)

Stand up PostgreSQL 14 and MongoDB 7.0 via Docker Compose alongside the existing SQLite file. Both databases initialize automatically from scripts in `backend/db/`.

**Deliverables:**
- `docker-compose.yml` with `postgres` and `mongodb` services
- `backend/db/init/01_schema.sql` — PostgreSQL schema auto-runs on first container start
- `backend/db/mongo-init/01_init.js` — MongoDB collections and indexes initialized on backend startup

### Phase 2 — Backend re-implementation (completed)

Replace the SQLite connection module with PostgreSQL (`pg` pool) and add MongoDB client for the new state endpoints.

**Deliverables:**
- `backend/src/db.js` — PostgreSQL connection pool with retry, slow-query logging, and query timeout
- `backend/src/mongo.js` — MongoDB client with connection caching and health check
- `backend/src/mongo-init.js` — Ensures collections and indexes exist on every startup
- New API endpoints: `/api/preferences`, `/api/workspace`, `/api/drafts`

### Phase 3 — Frontend refactor (completed)

Remove all `localStorage` state persistence. All state now flows through the REST API, which degrades gracefully when MongoDB is unreachable (returns cached or empty state, shows non-blocking error).

**Deliverables:**
- `frontend/src/api.js` — Centralized API client with 30-second cache, retry with backoff, and 503 graceful degradation
- `frontend/src/components/ErrorBoundary.jsx` — React error boundary for rendering failures

### Phase 4 — Data migration (on-demand)

One-time script to move existing SQLite rows into PostgreSQL. Run this when promoting a development instance that already has agents saved.

**Deliverables:**
- `backend/scripts/migrate-sqlite-to-pg.js` — Dry-run + live migration with UUID coercion and JSONB conversion
- `backend/scripts/rollback-migration.js` — Restores PostgreSQL (and optionally MongoDB) from JSON backups
- `backend/scripts/backup-sqlite.js / backup-postgresql.js / backup-mongodb.js` — Pre/post backup tooling

### Phase 5 — Testing and documentation (completed)

Achieve ≥ 90% line/function/statement coverage across all new backend modules; document all new APIs, schemas, and operational procedures.

---

## Architecture: Before vs. After

### Before (SQLite)

```
Browser
  │
  ▼
React frontend (localStorage for UI state)
  │  HTTP
  ▼
Express backend (port 4000)
  │  better-sqlite3
  ▼
agents.db  ←── single SQLite file
```

**Limitations:** Single-writer lock, no connection pooling, all state (agent data + UI state) co-mingled in one file, no health-check endpoint.

---

### After (PostgreSQL + MongoDB)

```
Browser
  │
  ▼
React frontend (no localStorage — all state via API)
  │  HTTP
  ▼
Express backend (port 4000)
  ├── pg pool ──────────────► PostgreSQL 14 (port 5432)
  │   agents, custom_skills,      persistent agent data
  │   users, subscriptions,
  │   categories, audit_log,
  │   webhooks, github_connections
  │
  └── MongoClient ─────────► MongoDB 7.0 (port 27017)
      builtin_skills              reference data (35 skills)
      persona_categories          persona taxonomy
      user_preferences            ephemeral user/session state
      workspace_state
      draft_agents
      agent_templates
```

**Gains:** Concurrent reads/writes, per-collection rate limiting, independent health checks for each store, operational separation of concerns.

---

## Key Decisions and Rationale

### Use PostgreSQL for agent data, MongoDB for session state

Agent records (`agents`, `custom_skills`) are structured, queryable, and benefit from SQL constraints and indexes. User preferences and workspace state are document-shaped, schema-flexible, and written far more frequently — MongoDB's upsert model is a natural fit.

### JSONB columns in PostgreSQL instead of normalized tables

`tools`, `skills`, `positions`, and `instructions` are arrays that vary per agent. Normalizing them into join tables would add complexity without query benefit — these fields are always read as a whole. JSONB lets us evolve the shape without schema migrations.

### UUIDs as primary keys

SQLite used auto-increment integers. PostgreSQL uses `gen_random_uuid()` as the default PK. The migration script converts integer IDs to UUIDs deterministically (hash-based) so that any external references can be updated predictably.

### Rate limiting on MongoDB endpoints only

PostgreSQL endpoints are protected at the connection-pool level (max 10 concurrent connections). MongoDB endpoints (`/api/preferences`, `/api/workspace`, `/api/drafts`) are user-facing and unbounded by nature, so a sliding-window 100 req/min/IP rate limiter guards against runaway clients.

### Graceful degradation when MongoDB is unavailable

PostgreSQL is the source of truth for all agent data. MongoDB stores convenience state only. If MongoDB is unreachable, the API returns `503` on those endpoints; the frontend shows a non-blocking warning and falls back to empty preferences/workspace state. Core agent CRUD is unaffected.

### Migration script is idempotent with dry-run

The migration script will not duplicate rows — it upserts by the derived UUID. `--dry-run` performs all validation and prints what would happen without writing anything, making it safe to run repeatedly before committing.

---

## Adding `agent_versions` to an Existing Deployment

`backend/db/init/06_agent_versions.sql` runs automatically on a **fresh** volume (`docker-compose up` with no prior data). For existing deployments the init directory is not re-executed, so you must apply the DDL manually:

```sql
-- Run against your PostgreSQL instance (psql, DBeaver, etc.)
CREATE TABLE IF NOT EXISTS agent_versions (
  id             BIGSERIAL   PRIMARY KEY,
  agent_id       UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_no     INT         NOT NULL,
  canonical_hash TEXT        NOT NULL,
  snapshot       JSONB       NOT NULL,
  change_summary TEXT        NOT NULL DEFAULT '',
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id
  ON agent_versions (agent_id, version_no DESC);

ANALYZE agent_versions;
```

**Cascade delete:** deleting an agent row automatically removes all of its `agent_versions` rows via `ON DELETE CASCADE` on the `agent_id` foreign key. No application-level cleanup is required.

**Verify after applying:**

```sql
-- Confirm the table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'agent_versions';

-- Confirm cascade: delete a test agent and check versions are gone
-- (use a non-production agent or a throwaway row)
```

---

## Adding Marketplace Columns to an Existing Deployment

`backend/db/init/07_marketplace.sql` runs automatically on a **fresh** volume. For existing deployments apply the DDL manually:

```sql
-- Run against your PostgreSQL instance (psql, DBeaver, etc.)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_tsv     tsvector;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS fork_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating_sum     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS forked_from    UUID REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_search_tsv     ON agents USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_agents_public_updated ON agents (updated_at DESC)
  WHERE visibility = 'public';

CREATE OR REPLACE FUNCTION agents_search_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),          'A') ||
    setweight(to_tsvector('english', coalesce(NEW.persona, '')),        'B') ||
    setweight(to_tsvector('english', coalesce(NEW.system_prompt, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_search_tsv ON agents;
CREATE TRIGGER trg_agents_search_tsv
  BEFORE INSERT OR UPDATE OF name, persona, system_prompt ON agents
  FOR EACH ROW EXECUTE FUNCTION agents_search_tsv_update();

-- Back-fill existing rows.
UPDATE agents
SET search_tsv =
  setweight(to_tsvector('english', coalesce(name, '')),          'A') ||
  setweight(to_tsvector('english', coalesce(persona, '')),        'B') ||
  setweight(to_tsvector('english', coalesce(system_prompt, '')), 'C')
WHERE search_tsv IS NULL;

ANALYZE agents;
```

**Notes:**

- `fork_count`, `favorite_count`, `rating_sum`, and `rating_count` all default to `0` — existing rows require no back-fill.
- Average rating is derived on read: `rating_sum / NULLIF(rating_count, 0)` — it is not stored.
- `forked_from` is nullable; existing agents that were not forked leave it `NULL`.
- The trigger covers every write path (create, edit, restore-from-version) with no application-layer changes required.

**Verify after applying:**

```sql
-- Confirm new columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'agents'
  AND column_name IN ('search_tsv','fork_count','favorite_count','rating_sum','rating_count','forked_from');

-- Confirm trigger exists
SELECT tgname FROM pg_trigger WHERE tgrelid = 'agents'::regclass;

-- Spot-check the partial index is used for public-agent queries
EXPLAIN SELECT id, name FROM agents
WHERE visibility = 'public'
ORDER BY updated_at DESC
LIMIT 20;
```

---

## Adding `tags` Column to an Existing Deployment

`backend/db/init/11_tags.sql` runs automatically on a **fresh** volume. For existing deployments apply the DDL manually:

```sql
-- Run against your PostgreSQL instance (psql, DBeaver, etc.)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_agents_tags ON agents USING GIN (tags);
ANALYZE agents;
```

**Notes:**

- `tags` defaults to `'[]'` — all existing agents automatically get an empty tag list with no back-fill required.
- Tags are stored as a JSONB array of lowercase strings (e.g. `["research", "coding"]`).
- The GIN index enables efficient containment queries (`tags @> '["research"]'`).
- The API validates tags on write: max 10 tags, each ≤ 30 characters, lowercased and trimmed, no duplicates.

**Verify after applying:**

```sql
-- Confirm column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'agents' AND column_name = 'tags';

-- Confirm GIN index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'agents' AND indexname = 'idx_agents_tags';
```

---

## Adding `tier` Column and `usage_counters` Table to an Existing Deployment

`backend/db/init/13_tier.sql` runs automatically on a **fresh** volume. For existing deployments apply the DDL manually:

```sql
-- Run against your PostgreSQL instance (psql, DBeaver, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CONSTRAINT users_tier_check CHECK (tier IN ('free', 'paid'));

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action   TEXT    NOT NULL,
  period   DATE    NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_user_today
  ON usage_counters (user_id, action)
  WHERE period = CURRENT_DATE;

ANALYZE users;
ANALYZE usage_counters;
```

**Notes:**

- `tier` defaults to `'free'` — all existing users get the free tier automatically; no back-fill required.
- A `CHECK` constraint enforces the allowed values (`'free'`, `'paid'`). Any future tier must be added to the constraint before use.
- Counter increments **must** use the atomic upsert pattern — never read-then-write:

```sql
INSERT INTO usage_counters (user_id, action, period, count)
VALUES ($1, $2, CURRENT_DATE, 1)
ON CONFLICT (user_id, action, period)
DO UPDATE SET count = usage_counters.count + 1;
```

- The partial index on `CURRENT_DATE` is rebuilt nightly by autovacuum/statistics; it accelerates the common quota-check query `WHERE user_id = $1 AND action = $2 AND period = CURRENT_DATE`.
- Rows for past periods accumulate; prune them with a scheduled job (e.g. `DELETE FROM usage_counters WHERE period < CURRENT_DATE - INTERVAL '90 days'`) if long-term storage is a concern.

**Verify after applying:**

```sql
-- Confirm tier column exists with correct default
SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'tier';

-- Confirm all existing users defaulted to 'free'
SELECT tier, COUNT(*) FROM users GROUP BY tier;

-- Confirm usage_counters table and index exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'usage_counters';

SELECT indexname FROM pg_indexes WHERE tablename = 'usage_counters';
```

---

## Adding `categories` Table and `category_id` Column to an Existing Deployment

`backend/db/init/14_categories.sql` runs automatically on a **fresh** volume. For existing deployments apply the DDL manually:

```sql
-- Run against your PostgreSQL instance (psql, DBeaver, etc.)
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
```

**Notes:**

- `category_id` is nullable — existing agents automatically become "uncategorized" with no back-fill required.
- `ON DELETE SET NULL` means deleting a category nulls `category_id` on all affected agents; no orphaned references are created.
- `GET /api/categories` is public (no auth required) — used by filter dropdowns in the frontend.
- `POST`, `PUT`, and `DELETE /api/categories` require authentication.
- Submitting an invalid (non-existent) `categoryId` on `POST/PUT /api/agents` returns a `400` error.
- The slug must be lowercase and may only contain letters, digits, and hyphens.

**Verify after applying:**

```sql
-- Confirm categories table and seed rows
SELECT slug, label FROM categories ORDER BY label;

-- Confirm category_id column on agents
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'agents' AND column_name = 'category_id';

-- Confirm index
SELECT indexname FROM pg_indexes
WHERE tablename = 'agents' AND indexname = 'idx_agents_category';
```

---

## Related Documents

- [Database Schema](database-schema.md) — PostgreSQL tables and MongoDB collections
- [Migration Guide](migration-guide.md) — Step-by-step migration instructions
- [Migration Checklist](migration-checklist.md) — Operator checklist for migration day
- [Docker Setup](docker-setup.md) — Running the database stack locally
- [Deployment Guide](deployment-guide.md) — Production deployment procedures
