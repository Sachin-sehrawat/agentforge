# Docker Setup

Local development environment using Docker Compose — PostgreSQL 14, MongoDB 7.0, and the AgentForge backend API.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / Mac) or Docker Engine + Compose plugin (Linux)
- Docker Compose v2 (`docker compose`) or v1 (`docker-compose`) — both work

## Quick Start

### 1. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` if you need non-default credentials or ports.

### 2. Start all services

```bash
docker compose --env-file .env.local up -d --build
```

This starts PostgreSQL, MongoDB, and the backend API. On first run, Docker builds the backend image and both databases are initialized automatically (schema + indexes via the init scripts).

> **Windows note:** Docker Desktop installs the CLI to `C:\Program Files\Docker\Docker\resources\bin\`. If `docker` is not found in your shell, either open a new terminal after Docker Desktop has started, or add that path to your `PATH` manually.

### 3. Verify all containers are healthy

```bash
docker compose ps
```

All three services (`postgres`, `mongodb`, `backend`) should show `(healthy)` status. The backend waits for both databases to pass health checks before it starts — this can take ~30 seconds on the first run.

```bash
# Quick API check
curl http://localhost:4000/api/health
```

Returns `{"ok": true}` when ready.

### 4. Seed reference data into MongoDB

Built-in skills and persona categories live in MongoDB and must be seeded once after the first start. The `scripts/` directory is not included in the Docker image, so run the seed script from the host:

```bash
# From the project root
MONGO_URI="mongodb://admin:adminpassword@localhost:27017/agentbuilder?authSource=admin" \
  node backend/scripts/migrate-skills-personas.js
```

On Windows (PowerShell):

```powershell
$env:MONGO_URI = "mongodb://admin:adminpassword@localhost:27017/agentbuilder?authSource=admin"
node backend/scripts/migrate-skills-personas.js
```

Expected output: 15 built-in skills and 11 persona categories inserted. Re-running is safe — existing documents are skipped.

> **When to re-run:** Only on first start, or after `docker compose down -v` wipes the MongoDB volume.

---

## Common Commands

| Command | Description |
|---------|-------------|
| `docker-compose --env-file .env.local up -d` | Start all services in the background |
| `docker-compose --env-file .env.local up` | Start with logs attached |
| `docker-compose down` | Stop and remove containers (data volumes preserved) |
| `docker-compose down -v` | Stop containers **and delete data volumes** |
| `docker-compose logs -f` | Stream logs from all services |
| `docker-compose logs -f backend` | Stream backend logs only |
| `docker-compose ps` | Show running service status |
| `docker-compose build backend` | Rebuild the backend image after code changes |
| `docker-compose restart backend` | Restart only the backend service |

---

## Services

### PostgreSQL (`postgres`)

| Setting | Default |
|---------|---------|
| Image | `postgres:14-alpine` |
| Port | `5432` (host) → `5432` (container) |
| Database | `agentforge` |
| User | `agentforge` |
| Password | `agentforge` |
| Volume | `postgres_data` |

**Init script:** [backend/db/init/01_schema.sql](../backend/db/init/01_schema.sql) — creates `agents` and `custom_skills` tables with indexes. Runs once on first container start.

Connect from the host:
```bash
psql postgresql://agentforge:agentforge@localhost:5432/agentforge
```

### MongoDB (`mongodb`)

| Setting | Default |
|---------|---------|
| Image | `mongo:7.0` |
| Port | `27017` (host) → `27017` (container) |
| Root user | `admin` / `adminpassword` |
| Database | `agentbuilder` |
| Volume | `mongo_data` |

**Init script:** [backend/db/mongo-init/01_init.js](../backend/db/mongo-init/01_init.js) — creates `user_preferences`, `workspace_state`, and `draft_agents` collections with indexes. Runs once on first container start.

**Seeded collections** (populated via `migrate-skills-personas.js` — see Quick Start step 4):
- `builtin_skills` — 15 built-in skill modifiers (Caveman, Formal Mode, ELI5, etc.)
- `persona_categories` — 11 categories containing 35 agent personas (Technology, Writing, Business, etc.)

Connect from the host:
```bash
mongosh "mongodb://admin:adminpassword@localhost:27017/agentbuilder?authSource=admin"
```

### Backend (`backend`)

| Setting | Default |
|---------|---------|
| Build context | `./backend` |
| Port | `4000` (host) → `4000` (container) |
| Health endpoint | `GET /api/health` |

The backend waits for both databases to pass their health checks before starting. Inside the Docker network, it connects to `postgres:5432` and `mongodb:27017`.

---

## Data Persistence

Named volumes keep data between `docker-compose down` / `up` cycles:

- `postgres_data` — PostgreSQL data directory
- `mongo_data` — MongoDB data directory

To wipe all data and start fresh:
```bash
docker compose down -v
docker compose --env-file .env.local up -d --build
```

After wiping, re-run the seed script (Quick Start step 4) — the MongoDB volume is empty so `builtin_skills` and `persona_categories` need to be repopulated.

---

## Networking

All services share the internal bridge network `agentforge-net`. Service names act as hostnames:

- `postgres` — PostgreSQL
- `mongodb` — MongoDB
- `backend` — Express API

Only the ports listed above are exposed to the host machine.

---

## Development Workflow

### Running databases only (backend on the host)

If you want to run the backend with `npm run dev` for hot-reload while keeping databases in Docker:

```bash
# Start only the databases
docker-compose --env-file .env.local up -d postgres mongodb

# Run backend locally (make sure backend/.env points to localhost)
cd backend && npm run dev
```

The default `backend/.env.example` uses `localhost` for both database hosts, which works when the backend is running directly on the host.

### Rebuilding the backend image

After changing `package.json` or any source file:
```bash
docker-compose build backend
docker-compose --env-file .env.local up -d backend
```

---

## Environment Variables

All variables have sensible defaults in `docker-compose.yml`. Override any of them in `.env.local`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Backend port |
| `POSTGRES_PORT` | `5432` | PostgreSQL host port |
| `POSTGRES_DB` | `agentforge` | Database name |
| `POSTGRES_USER` | `agentforge` | DB user |
| `POSTGRES_PASSWORD` | `agentforge` | DB password |
| `POSTGRES_POOL_MAX` | `10` | Max PG pool connections |
| `POSTGRES_POOL_MIN` | `2` | Min PG pool connections |
| `MONGO_PORT` | `27017` | MongoDB host port |
| `MONGO_DB` | `agentbuilder` | MongoDB database name |
| `MONGO_ROOT_USERNAME` | `admin` | MongoDB root username |
| `MONGO_ROOT_PASSWORD` | `adminpassword` | MongoDB root password |
| `QUERY_TIMEOUT_MS` | `5000` | PG query timeout |
| `SLOW_QUERY_THRESHOLD_MS` | `1000` | Slow query log threshold |

---

## Credential Management

- **Never commit** `.env.local` — it is listed in `.gitignore`.
- Rotate credentials by updating `.env.local`, running `docker-compose down -v`, then starting fresh.
- For production deployments, use a secrets manager (e.g., AWS Secrets Manager, Doppler) instead of `.env` files.

---

## Troubleshooting

**Port already in use**
Change the host port in `.env.local` (e.g. `POSTGRES_PORT=5433`) and restart.

**Backend fails to connect on first run**
The backend waits for database health checks, but on very slow machines the `start_period` may need to be increased in `docker-compose.yml`. Check logs with `docker-compose logs backend`.

**MongoDB init script did not run**
Init scripts only execute when the data volume is empty (first start). Wipe the volume with `docker-compose down -v` to re-run them.

**Permission denied on Linux**
You may need to prefix commands with `sudo` or [add your user to the `docker` group](https://docs.docker.com/engine/install/linux-postinstall/).

**`docker` not found on Windows**
Docker Desktop installs the CLI to `C:\Program Files\Docker\Docker\resources\bin\`. Open a new terminal after Docker Desktop has fully started, or add that directory to your `PATH`. Alternatively, use the full path: `& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose ...`

**Seed script `Cannot find module` error**
The `scripts/` directory is not copied into the Docker image. Run `migrate-skills-personas.js` from the host (not via `docker exec`), as shown in Quick Start step 4.
