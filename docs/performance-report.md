# AgentForge Performance Report

## Overview

This document tracks load testing results, database optimizations applied, and capacity planning projections for the AgentForge PostgreSQL + MongoDB architecture.

---

## Acceptance Criteria Targets

| Endpoint Group | Target (p95) | Status |
|---------------|-------------|--------|
| Agent CRUD (`/api/agents`) | < 200ms | ✅ Instrumented |
| Preferences API (`/api/preferences`) | < 100ms | ✅ Instrumented |
| Workspace API (`/api/workspace`) | < 150ms | ✅ Instrumented |
| PostgreSQL query execution | < 100ms | ✅ RETURNING * optimization |
| MongoDB document retrieval | < 50ms | ✅ Compound indexes added |

---

## Optimizations Applied

### Backend (Express)

| Optimization | File | Impact |
|-------------|------|--------|
| gzip compression (`compression` middleware) | `src/app.js` | ~70% smaller JSON responses |
| Keep-Alive connection reuse | `src/app.js` | Eliminates TCP handshake overhead per request |
| `INSERT ... RETURNING *` (agents, skills) | `src/app.js` | Eliminates 1 SELECT round-trip per POST |
| `UPDATE ... RETURNING *` (agents, skills) | `src/app.js` | Eliminates 2 DB round-trips per PUT (was check + update + select) |
| `findOneAndUpdate` w/ `returnDocument: 'after'` | `src/app.js` | Eliminates 1 findOne round-trip per POST preferences/workspace |
| `/api/metrics` endpoint | `src/app.js` | Exposes pool stats + request counters for dashboards |

**Database round-trip reduction summary:**

| Endpoint (before → after) | Old | New | Saved |
|--------------------------|-----|-----|-------|
| `POST /api/agents` | 2 queries | 1 query | 1 query |
| `PUT /api/agents/:id` | 3 queries | 1 query | 2 queries |
| `POST /api/skills` | 2 queries | 1 query | 1 query |
| `PUT /api/skills/:id` | 3 queries | 1 query | 2 queries |
| `POST /api/preferences/:userId` | 2 operations | 1 operation | 1 operation |
| `POST /api/workspace/:workspaceId` | 2 operations | 1 operation | 1 operation |

### PostgreSQL Indexes

File: `backend/db/init/02_performance_indexes.sql`

| Index | Column | Type | Purpose |
|-------|--------|------|---------|
| `idx_agents_tools_gin` | `agents.tools` | GIN | JSONB containment queries (`@>`) |
| `idx_agents_skills_gin` | `agents.skills` | GIN | JSONB containment queries |
| `idx_agents_model` | `agents.model` | BTREE | Model-based filtering/analytics |
| `idx_agents_name_text` | `agents.name` | BTREE `text_pattern_ops` | Prefix text search (`LIKE 'x%'`) |
| `idx_custom_skills_label` | `custom_skills.label` | BTREE | Label lookup |
| `idx_agents_updated_at` | `agents.updated_at DESC` | BTREE | `ORDER BY updated_at DESC` (already existed) |
| `idx_agents_name` | `agents.name` | BTREE | Equality lookup (already existed) |
| `idx_agents_owner_id` | `agents.owner_id` | BTREE | List all agents owned by a user |
| `idx_agents_visibility` | `agents.visibility` | BTREE | Filter public vs. private agents |
| `idx_custom_skills_owner_id` | `custom_skills.owner_id` | BTREE | List all skills owned by a user |
| `idx_custom_skills_visibility` | `custom_skills.visibility` | BTREE | Filter public vs. private skills |

### MongoDB Indexes

File: `backend/db/mongo-init/01_init.js`

| Collection | Index | Type | Purpose |
|-----------|-------|------|---------|
| `user_preferences` | `{ userId: 1 }` | Unique | O(1) user lookup (already existed) |
| `user_preferences` | `{ updatedAt: -1 }` | BTREE | Sorting by recency (already existed) |
| `workspace_state` | `{ workspaceId: 1 }` | Unique | O(1) workspace lookup (already existed) |
| `draft_agents` | `{ workspaceId: 1, createdAt: -1 }` | Compound | Covers `find({workspaceId}).sort({createdAt:-1})` |
| `draft_agents` | `{ createdAt: 1 }` | TTL (30 days) | Auto-delete old drafts, keeps collection bounded |

**Compound index rationale:** The original `draft_agents` collection had two separate indexes (`{workspaceId: 1}` + `{createdAt: -1}`). MongoDB could only use one per query. The compound `{workspaceId: 1, createdAt: -1}` index covers the primary query (`find({workspaceId}).sort({createdAt:-1})`) in a single index scan without a separate sort step, reducing memory and CPU usage under load.

---

## Connection Pool Configuration

### PostgreSQL (via `pg`)

| Parameter | Default | Tuned | Notes |
|-----------|---------|-------|-------|
| `POSTGRES_POOL_MAX` | 10 | 20 (production) | 1 connection per CPU core × safety factor |
| `POSTGRES_POOL_MIN` | 2 | 5 (production) | Keep warm connections ready |
| `connectionTimeoutMillis` | 5000 | 5000 | — |
| `idleTimeoutMillis` | 30000 | 30000 | — |
| `query_timeout` | 5000 | 5000 | — |

For production, set `POSTGRES_POOL_MAX=20` in docker-compose and `POSTGRES_POOL_MIN=5`.

### MongoDB

The MongoDB Node.js driver manages its own internal connection pool. Default pool size is 5. For higher concurrency, set `maxPoolSize` in the URI:

```
MONGO_URI=mongodb://.../?maxPoolSize=20
```

---

## Baseline Metrics (Run After Deployment)

> Fill in these values after running k6 against staging or production.

### Load Test: 100 Concurrent Users (9 min)

| Metric | Target | Measured | Pass? |
|--------|--------|----------|-------|
| Agent list p95 | < 200ms | _TBD_ | — |
| Agent create p95 | < 200ms | _TBD_ | — |
| Agent update p95 | < 200ms | _TBD_ | — |
| Preferences GET p95 | < 100ms | _TBD_ | — |
| Preferences POST p95 | < 100ms | _TBD_ | — |
| Workspace GET p95 | < 150ms | _TBD_ | — |
| Draft list p95 | < 150ms | _TBD_ | — |
| Overall error rate | < 1% | _TBD_ | — |
| Peak PG pool utilization | < 80% | _TBD_ | — |
| Throughput (req/s) | — | _TBD_ | — |

### Load Test: 500 Concurrent Users

| Metric | Target | Measured | Pass? |
|--------|--------|----------|-------|
| Agent CRUD p95 | < 200ms | _TBD_ | — |
| Preferences p95 | < 100ms | _TBD_ | — |
| Error rate | < 1% | _TBD_ | — |
| PG pool saturation | < 90% | _TBD_ | — |

---

## Frontend Cache Validation

The frontend caches GET responses in-memory with a 30-second TTL (`frontend/src/api.js`).

| Endpoint | Cache Key | TTL | Expected Hit Ratio |
|----------|-----------|-----|-------------------|
| `GET /api/preferences/:userId` | `prefs:{userId}` | 30s | > 90% (preferences change infrequently) |
| `GET /api/workspace/:workspaceId` | `ws:{workspaceId}` | 30s | > 70% (auto-save writes every few seconds) |
| `GET /api/drafts/:workspaceId` | `drafts:{workspaceId}` | 30s | > 80% |

Cache miss cost is bounded by the MongoDB indexes. Cache hit cost is zero (no network).

**Memory usage:** Each cache entry is a JSON object. With 1000 active users at 30s TTL, the Map holds at most ~1000 entries. At ~1KB per entry, this is ~1MB — well within browser memory limits.

---

## Network Latency Considerations

| Optimization | Implementation | Benefit |
|-------------|---------------|---------|
| HTTP Keep-Alive | `Connection: keep-alive` header in `src/app.js` | Eliminates TCP handshake (~3ms) per request |
| gzip compression | `compression` middleware, threshold 1KB | ~70% smaller payloads for agent lists |
| Request batching | k6 scenarios use think-time sleeps | Avoids thundering-herd on MongoDB rate limit |
| Rate limiter at 100 req/IP/min | `src/app.js` | Protects MongoDB from overload; increase for trusted internal clients |

---

## Capacity Planning Projections

Based on current architecture (single Express process, PG pool max 20, Mongo pool max 20):

| Daily Active Users | Peak Concurrent | Estimated p95 | Headroom |
|-------------------|----------------|--------------|---------|
| 100 | ~10 | < 50ms | Comfortable |
| 1,000 | ~100 | < 100ms | Comfortable |
| 5,000 | ~500 | < 200ms | At limit |
| 10,000 | ~1,000 | > 200ms (agents) | Requires horizontal scaling |

**Scaling thresholds:**
- At **500+ concurrent users**: increase `POSTGRES_POOL_MAX` to 30 and add `pg_bouncer` connection pooler between Express and PostgreSQL.
- At **1000+ concurrent users**: add a second Express replica behind a load balancer; use session-sticky routing for the rate limiter (or switch to Redis-backed rate limiting).
- At **5000+ concurrent users**: shard MongoDB workspace state by region; consider read replicas for PostgreSQL.

---

## Continuous Monitoring

### /api/metrics Endpoint

`GET /api/metrics` returns:

```json
{
  "uptime_seconds": 3600,
  "requests_total": 150000,
  "errors_total": 12,
  "error_rate": "0.0001",
  "avg_duration_ms": 42,
  "pg_pool": {
    "total": 10,
    "idle": 7,
    "waiting": 0
  },
  "rate_limiter": {
    "tracked_ips": 23
  }
}
```

**Alert thresholds (configure in your APM tool):**

| Metric | Warning | Critical |
|--------|---------|----------|
| `error_rate` | > 0.005 | > 0.01 |
| `avg_duration_ms` | > 200ms | > 500ms |
| `pg_pool.waiting` | > 0 | > 5 |
| `pg_pool.idle / pg_pool.total` | < 20% | < 5% |

### Slow Query Detection

The backend logs slow queries automatically:

```
SLOW_QUERY_THRESHOLD_MS=200  # Log queries slower than 200ms (default: 1000ms)
```

Reduce this threshold in production to catch regressions early.

### PostgreSQL Built-in Monitoring

```sql
-- Find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname IN ('agents', 'custom_skills')
ORDER BY idx_scan DESC;

-- Connection pool status
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

Enable `pg_stat_statements` in PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

---

## How to Run Benchmarks

```bash
# 1. Start the stack
docker compose up -d

# 2. Wait for healthy state
docker compose ps

# 3. Run smoke test
cd performance/k6
k6 run scenarios/agents.js

# 4. Run full load test suite
SCENARIO=load_100 k6 run scenarios/full-suite.js

# 5. Check metrics after run
curl http://localhost:4000/api/metrics | jq .

# 6. Check PG slow query log
docker compose logs backend | grep "Slow query"
```
