# Operations Runbook

Day-to-day operational tasks, backup/restore procedures, performance tuning, and troubleshooting for AgentForge.

---

## Common Operational Tasks

### Check service status

```bash
docker compose ps
```

All three services should show `(healthy)`. If any shows `(unhealthy)` or `(starting)`, check logs:

```bash
docker compose logs --tail=50 <service>   # service: postgres | mongodb | backend
```

### Restart a service

```bash
docker compose restart backend
docker compose restart postgres
docker compose restart mongodb
```

### View live logs

```bash
docker compose logs -f backend     # includes per-request timing
docker compose logs -f postgres
docker compose logs -f mongodb
```

### Connect to PostgreSQL

```bash
# Interactive psql shell
docker compose exec postgres psql -U agentforge -d agentforge

# One-off query
docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT COUNT(*) FROM agents;"
```

### Connect to MongoDB

```bash
# Interactive mongosh shell
docker compose exec mongodb mongosh \
  -u admin -p adminpassword --authenticationDatabase admin agentbuilder

# One-off command
docker compose exec mongodb mongosh \
  -u admin -p adminpassword --authenticationDatabase admin agentbuilder \
  --eval "db.user_preferences.countDocuments()"
```

### List all agents

```bash
docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT id, name, model, updated_at FROM agents ORDER BY updated_at DESC;"
```

### Delete a stale draft

```bash
curl -X DELETE http://localhost:4000/api/drafts/<draftId>
```

---

## Backup Procedures

Always back up before schema changes, dependency updates, or migrations. See [disaster-recovery.md](disaster-recovery.md) for automated cron job setup.

### Manual backup — all databases

Run all three backup scripts from `backend/`:

```bash
cd backend
node scripts/backup-sqlite.js          # legacy SQLite (if file exists)
node scripts/backup-postgresql.js      # PostgreSQL → backups/postgresql/
node scripts/backup-mongodb.js         # MongoDB    → backups/mongodb/
```

Each script creates a timestamped file:
- `backups/postgresql/pg-backup-<YYYY-MM-DDTHH-MM-SS>.json`
- `backups/mongodb/mongo-backup-<YYYY-MM-DDTHH-MM-SS>.json`

### Tag a pre-migration backup

Before any migration, rename the backup with a `pre-migration-` prefix so it is never auto-pruned:

```bash
cd backend/backups/postgresql
mv pg-backup-<stamp>.json pre-migration-pg-backup-<stamp>.json
```

### Verify a backup without restoring

```bash
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --dry-run
```

Exits `0` if the file is valid, `1` if it is corrupt or missing required fields.

---

## Restore Procedures

### Restore PostgreSQL from backup

```bash
cd backend

# 1. Validate
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --dry-run

# 2. Restore (overwrites current PostgreSQL data)
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json

# 3. Verify row counts
docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT COUNT(*) FROM agents; SELECT COUNT(*) FROM custom_skills;"
```

### Restore MongoDB from backup

```bash
node scripts/rollback-migration.js \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>.json \
  --mongo-only
```

### Full restore (both databases)

```bash
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>.json
```

---

## Performance Tuning

### PostgreSQL connection pool

Controlled via environment variables in `.env`:

```env
POSTGRES_POOL_MAX=10    # increase for high-concurrency workloads
POSTGRES_POOL_MIN=2     # idle connections to keep alive
QUERY_TIMEOUT_MS=5000   # abort queries slower than this
SLOW_QUERY_THRESHOLD_MS=1000  # log warning for queries exceeding this
```

Check for slow queries in logs:

```bash
docker compose logs backend | grep "SLOW QUERY"
```

### Identify missing indexes

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c "
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename IN ('agents','custom_skills')
ORDER BY tablename, attname;"
```

### Check table sizes

```bash
docker compose exec postgres psql -U agentforge -d agentforge -c "
SELECT
  relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### MongoDB — check index usage

```bash
docker compose exec mongodb mongosh \
  -u admin -p adminpassword --authenticationDatabase admin agentbuilder \
  --eval "db.user_preferences.aggregate([{\$indexStats:{}}]).toArray()"
```

### MongoDB — collection document counts

```bash
docker compose exec mongodb mongosh \
  -u admin -p adminpassword --authenticationDatabase admin agentbuilder \
  --eval "
    ['user_preferences','workspace_state','draft_agents'].forEach(c => {
      print(c + ': ' + db[c].countDocuments())
    })"
```

### Rate limit tuning

MongoDB-backed endpoints are rate-limited at 100 req/IP/minute. To change the limit, update `RATE_LIMIT_MAX` in [backend/src/app.js](../backend/src/app.js):

```js
const RATE_LIMIT_MAX = 100;       // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000;  // 1 minute
```

---

## Troubleshooting Guide

### Backend fails to start

**Symptoms:** `docker compose ps` shows backend as `unhealthy` or exited.

**Steps:**

1. Check logs: `docker compose logs backend`
2. Confirm PostgreSQL is healthy: `docker compose ps postgres`
3. Confirm MongoDB is healthy: `docker compose ps mongodb`
4. Verify `.env` variables are set correctly (no missing `POSTGRES_*` or `MONGO_URI`)
5. Restart: `docker compose restart backend`

---

### `GET /api/health` returns 503

**Cause:** Backend cannot reach PostgreSQL.

**Steps:**

1. `docker compose ps postgres` — should show `(healthy)`
2. If unhealthy: `docker compose logs postgres` — look for auth errors or disk full
3. Check `POSTGRES_HOST` in `.env` matches the service name in `docker-compose.yml` (default: `postgres`)
4. Try connecting manually: `docker compose exec postgres pg_isready -U agentforge`

---

### `GET /api/health/mongo` returns 503

**Cause:** Backend cannot reach MongoDB.

**Steps:**

1. `docker compose ps mongodb` — should show `(healthy)`
2. If unhealthy: `docker compose logs mongodb` — look for auth errors
3. Check `MONGO_URI` in `.env` — ensure username/password match `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`
4. Try connecting: `docker compose exec mongodb mongosh -u admin -p adminpassword --authenticationDatabase admin --eval "db.adminCommand('ping')"`

---

### API returns 429 Too Many Requests

**Cause:** Rate limit exceeded on a MongoDB-backed route.

**Resolution:** Wait for the rate-limit window to reset (up to 60 seconds). Check `X-RateLimit-Reset` in the response headers for the exact reset time. If legitimate traffic is being throttled, increase `RATE_LIMIT_MAX` in `app.js`.

---

### Agents not loading in the UI

**Steps:**

1. Open browser DevTools → Network tab
2. Check `GET /api/agents` — should return 200 with an array
3. If 500: `docker compose logs backend` — look for `[ERROR]` lines
4. If empty array and you had SQLite data: run the migration script (see [migration-guide.md](migration-guide.md))
5. Verify PostgreSQL has data: `docker compose exec postgres psql -U agentforge -d agentforge -c "SELECT COUNT(*) FROM agents;"`

---

### User preferences not persisting

**Cause:** MongoDB is unreachable (returns 503) or the rate limit is hit.

**Steps:**

1. `curl http://localhost:4000/api/health/mongo` — confirm MongoDB is up
2. Check for 503 in DevTools Network tab on preference save calls
3. If MongoDB is healthy, check for 429 (rate limit) on `/api/preferences`
4. Restart MongoDB if stuck: `docker compose restart mongodb`

---

### Draft agents missing after restart

**Cause:** Normal — MongoDB containers persist data in the `mongo_data` Docker volume. If the volume was deleted (`docker compose down -v`), all MongoDB data is lost.

**Recovery:** Restore from the most recent MongoDB backup (see Restore Procedures above).

---

### Disk space filling up

**Check usage:**

```bash
docker system df                  # Docker images and volumes
du -sh backend/backups/           # Local backup directory
```

**Prune old Docker resources:**

```bash
docker system prune --volumes     # removes stopped containers, unused images, unused volumes
```

**Prune old backups manually:**

```bash
find backend/backups -type f -mtime +30 -delete
```

---

### Migration script fails mid-run

**Steps:**

1. Check exit code and last lines of script output for the error message
2. Do NOT re-run the migration without rolling back first — partial data may exist in PostgreSQL
3. Run rollback: `node scripts/rollback-migration.js --pg-backup backups/postgresql/pg-backup-<stamp>.json`
4. Fix the root cause (usually a malformed row in SQLite — use `--dry-run` to surface it)
5. Re-run with `--dry-run`, verify output, then run live

---

## Related Documents

- [Disaster Recovery](disaster-recovery.md) — Backup scheduling and recovery scenarios
- [Deployment Guide](deployment-guide.md) — Production setup and environment variables
- [Migration Guide](migration-guide.md) — SQLite → PostgreSQL migration steps
- [Docker Setup](docker-setup.md) — Local Docker Compose reference
- [API Reference](api.md) — Endpoint reference for manual verification
