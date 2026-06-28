# Deployment Guide

Step-by-step instructions for deploying AgentForge in a production environment.

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Docker | 24.x | Docker Compose v2 bundled |
| Docker Compose | v2.x | `docker compose` (no hyphen) |
| Node.js | 18 LTS | Only needed if running services outside Docker |
| Available ports | 3000, 4000, 5432, 27017 | Adjust in `docker-compose.yml` if occupied |
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
| `FRONTEND_PORT` | `3000` | Host port for the frontend (nginx) |
| `PORT` | `4000` | Backend HTTP port |
| `POSTGRES_HOST` | `postgres` | Hostname of the PostgreSQL container |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `agentforge` | Database name |
| `POSTGRES_USER` | `agentforge` | Database user |
| `POSTGRES_PASSWORD` | `agentforge` | Database password — **change in production** |
| `MONGO_URI` | `mongodb://admin:adminpassword@mongodb:27017/agentbuilder?authSource=admin` | Full MongoDB connection string |
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
- Pull `postgres:14-alpine`, `mongo:7.0`, and `nginx:alpine` images
- Build the backend image from `backend/Dockerfile`
- Build the frontend image from `frontend/Dockerfile` (multi-stage: Vite build → nginx)
- Run all PostgreSQL init scripts (`01_schema.sql` → `12_seed_agents.sql`) on first volume start — schema, indexes, and 20 public seed agents
- Run MongoDB init scripts (`01_init.js`, `02_seed_templates.js`) on first volume start — collections and agent templates
- Start all four services with health checks

### 3. Verify services are healthy

```bash
docker compose ps
```

All four services (`postgres`, `mongodb`, `backend`, `frontend`) should show `healthy` or `running` status. If any is `starting`, wait 15–60 seconds and re-check.

```bash
# Verify backend (PostgreSQL)
curl http://localhost:4000/api/health
# → {"ok":true}

# Verify MongoDB
curl http://localhost:4000/api/health/mongo
# → {"ok":true}

# Verify frontend is serving the app
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# → 200
```

The application is accessible at **`http://localhost:3000`** (or the IP/domain of your host).

### 4. Seed MongoDB reference data

Built-in skills and persona categories live in MongoDB and must be seeded once after the first start. The `scripts/` directory is not included in the Docker image, so run this from the host:

```bash
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js
```

This inserts 15 built-in skills and 11 persona categories (35 personas). Re-running is safe — existing documents are skipped. The container already has the correct `MONGO_URI` and all dependencies; no local Node.js install required.

> The 20 public seed agents (research, security, testing, efficiency, etc.) are seeded automatically into PostgreSQL by `12_seed_agents.sql` on first start — no extra step needed.

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

All scripts in `backend/db/init/` run automatically in filename order when the Docker volume is empty (first start). They are fully idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

| File | Purpose |
|---|---|
| `01_schema.sql` | Core tables and indexes |
| `02–11_*.sql` | Performance indexes, marketplace columns, ratings, favorites, tags |
| `12_seed_agents.sql` | 20 public seed agents across research, security, testing, and more |

To re-apply a specific script against a running container:

```bash
# Example: re-run the seed agents script
Get-Content backend/db/init/12_seed_agents.sql | \
  docker compose exec -T postgres psql -U agentforge -d agentforge
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

# Rebuild only what changed
docker compose up -d --build backend   # backend source changes
docker compose up -d --build frontend  # frontend source changes

# Or rebuild everything
docker compose up -d --build
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
| `frontend` | _(none — nginx exits on startup failure)_ | — | — | — |

The backend waits for both databases to become healthy before starting. The frontend waits for the backend to become healthy before starting (`depends_on: condition: service_healthy`).

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
