# Deployment Guide

Step-by-step instructions for deploying AgentForge in a production environment.

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Docker | 24.x | Docker Compose v2 bundled |
| Docker Compose | v2.x | `docker compose` (no hyphen) |
| Node.js | 18 LTS | Only needed if running backend outside Docker |
| Available ports | 4000, 5432, 27017 | Adjust in `docker-compose.yml` if occupied |
| Disk space | 2 GB free | For images, volumes, and backups |

---

## Environment Variables

Copy the example file and fill in each value before starting:

```bash
cp .env.local.example .env
```

### Required variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Backend HTTP port |
| `POSTGRES_HOST` | `postgres` | Hostname of the PostgreSQL container |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `agentforge` | Database name |
| `POSTGRES_USER` | `agentforge` | Database user |
| `POSTGRES_PASSWORD` | `agentforge` | Database password — **change in production** |
| `MONGO_URI` | `mongodb://admin:adminpassword@mongodb:27017/agentforge?authSource=admin` | Full MongoDB connection string |
| `MONGO_ROOT_USERNAME` | `admin` | MongoDB root username |
| `MONGO_ROOT_PASSWORD` | `adminpassword` | MongoDB root password — **change in production** |

### Optional tuning variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_POOL_MAX` | `10` | Maximum PostgreSQL connections in pool |
| `POSTGRES_POOL_MIN` | `2` | Minimum idle connections kept alive |
| `DATABASE_URL` | _(unset)_ | Full PostgreSQL DSN — overrides individual `POSTGRES_*` vars |
| `QUERY_TIMEOUT_MS` | `5000` | Per-query timeout in milliseconds |
| `SLOW_QUERY_THRESHOLD_MS` | `1000` | Queries slower than this are logged as warnings |

> **Security:** Never commit `.env` to version control. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Docker secrets) for production credentials.

---

## Production Deployment

### 1. Clone and configure

```bash
git clone <repo-url> agent-builder
cd agent-builder
cp .env.local.example .env
# Edit .env with production credentials and your domain/port values
```

### 2. Build and start the stack

```bash
docker compose up -d --build
```

This will:
- Pull `postgres:14-alpine` and `mongo:7.0` images
- Build the backend image from `backend/Dockerfile`
- Run `backend/db/init/01_schema.sql` on PostgreSQL (first start only)
- Start all three services with health checks

### 3. Verify services are healthy

```bash
docker compose ps
```

All three services (`postgres`, `mongodb`, `backend`) should show `healthy` status. If any is `starting`, wait 15–30 seconds and re-check.

```bash
# Verify PostgreSQL
curl http://localhost:4000/api/health
# → {"ok":true}

# Verify MongoDB
curl http://localhost:4000/api/health/mongo
# → {"ok":true}
```

### 4. (Optional) Seed MongoDB fixture data

```bash
docker compose exec backend node db/mongo-seed.js
```

This loads sample preferences and workspace state for local testing. Skip in production unless you want demonstration data.

### 5. (Optional) Migrate existing SQLite data

If you have an existing `backend/agents.db` from a pre-migration deployment:

```bash
# Dry run first — review output before committing
docker compose exec backend node scripts/migrate-sqlite-to-pg.js --dry-run

# Execute migration
docker compose exec backend node scripts/migrate-sqlite-to-pg.js
```

See [migration-guide.md](migration-guide.md) for full instructions and [migration-checklist.md](migration-checklist.md) for the operator checklist.

---

## Database Initialization

### PostgreSQL

The schema initializes automatically via `backend/db/init/01_schema.sql` when the Docker volume is empty (first start). The init script is idempotent — it uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so re-running it is safe.

If you need to re-initialize a running container manually:

```bash
docker compose exec postgres psql -U agentforge -d agentforge \
  -f /docker-entrypoint-initdb.d/01_schema.sql
```

### MongoDB

Collections and indexes are created by `backend/src/mongo-init.js` every time the backend starts. It is idempotent — existing collections are left unchanged.

Collections created:
- `user_preferences` — index on `userId` (unique)
- `workspace_state` — index on `workspaceId` (unique)
- `draft_agents` — indexes on `workspaceId` and `createdAt`

---

## Updating the Deployment

```bash
git pull
docker compose up -d --build backend   # rebuild only the backend image
```

PostgreSQL and MongoDB data volumes are persisted across restarts and rebuilds. Schema changes require running a migration script (none are needed as of the current release).

---

## Monitoring and Health Checks

### Built-in health endpoints

| Endpoint | What it checks | Expected response |
|---|---|---|
| `GET /api/health` | PostgreSQL query (`SELECT 1`) | `{"ok":true}` |
| `GET /api/health/mongo` | MongoDB `ping` command | `{"ok":true}` |

Both return `{"ok":false,"error":"..."}` with HTTP 503 when the underlying database is unreachable.

### Docker Compose health checks

Each service has a health check configured in `docker-compose.yml`:

| Service | Command | Interval | Timeout | Retries |
|---|---|---|---|---|
| `postgres` | `pg_isready -U agentforge` | 10 s | 5 s | 5 |
| `mongodb` | `mongosh --eval "db.adminCommand('ping')"` | 10 s | 5 s | 5 |
| `backend` | `curl -f /api/health` | 30 s | 10 s | 3 |

The backend service waits for both databases to become healthy before starting (`depends_on: condition: service_healthy`).

### Application logs

```bash
# Tail all services
docker compose logs -f

# Backend only (includes per-request timing and slow-query warnings)
docker compose logs -f backend

# Filter for slow queries (>1000ms by default)
docker compose logs backend | grep "SLOW QUERY"

# Filter for errors
docker compose logs backend | grep "\[ERROR\]"
```

Log line format:
```
[2024-06-01T12:00:00.000Z] GET /api/agents 200 42ms
```

### Recommended external monitoring

| Tool | What to monitor |
|---|---|
| Uptime monitor (Pingdom, UptimeRobot) | Poll `GET /api/health` every 60 s |
| Log aggregator (Datadog, Papertrail) | Stream `docker compose logs` — alert on `[ERROR]` |
| Disk usage alert | Alert when `/var/lib/docker/volumes/` exceeds 80% |
| Backup health check (Healthchecks.io) | Ping after each nightly backup cron job |

---

## Stopping and Restarting

```bash
# Stop services (data volumes preserved)
docker compose down

# Stop AND remove volumes (destructive — data lost)
docker compose down -v

# Restart a single service
docker compose restart backend
```

---

## Related Documents

- [Docker Setup](docker-setup.md) — Local development environment
- [Migration Overview](migration-overview.md) — Architecture and migration context
- [Runbook](runbook.md) — Day-to-day operations and troubleshooting
- [Disaster Recovery](disaster-recovery.md) — Backup and restore procedures
