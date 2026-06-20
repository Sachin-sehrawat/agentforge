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
  │   agents, custom_skills       persistent agent data
  │
  └── MongoClient ─────────► MongoDB 7.0 (port 27017)
      user_preferences            ephemeral user/session state
      workspace_state
      draft_agents
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

## Related Documents

- [Database Schema](database-schema.md) — PostgreSQL tables and MongoDB collections
- [Migration Guide](migration-guide.md) — Step-by-step migration instructions
- [Migration Checklist](migration-checklist.md) — Operator checklist for migration day
- [Docker Setup](docker-setup.md) — Running the database stack locally
- [Deployment Guide](deployment-guide.md) — Production deployment procedures
