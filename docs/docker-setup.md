# Local Setup Guide

Everything you need to run AgentForge locally — from zero to a fully seeded app in a few commands.

---

## TL;DR (Docker, all-in-one)

```bash
# 1. Copy env file and set a JWT secret
cp .env.local.example .env.local
# Edit .env.local — change JWT_SECRET to any long random string

# 2. Start all four services (builds images on first run)
docker compose --env-file .env.local up -d --build

# 3. Seed MongoDB reference data (skills + persona categories)
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js

# 4. Open the app
# http://localhost:3000  — sign up for a new account to get started
```

That's it. Everything else (schema, indexes, public seed agents, templates) is automatic.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Windows / macOS. Linux: Docker Engine + Compose plugin. |
| Node.js 18+ | Only needed for the MongoDB seed script (step 3 above) and local dev mode. |
| Ports free: 3000, 4000, 5432, 27017 | Override in `.env.local` if any are in use. |

---

## Step-by-step Docker Setup

### 1. Configure the environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set `JWT_SECRET` to any long random string. Everything else works with the defaults.

Generate a secret quickly:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Start all services

```bash
docker compose --env-file .env.local up -d --build
```

This starts four containers. On the very first run it also:

- Builds the backend and frontend images from source
- Runs all PostgreSQL init scripts in order (schema → indexes → seed agents)
- Runs MongoDB init scripts (collections → agent templates)

Wait ~30–60 seconds on first run. Check status:

```bash
docker compose ps
```

All four services should show `healthy` or `running`. Then verify the backend:

```bash
# macOS / Linux
curl http://localhost:4000/api/health
# → {"ok":true}

# Windows (PowerShell)
Invoke-RestMethod -Uri http://localhost:4000/api/health
```

### 3. Seed MongoDB reference data

```bash
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js
```

The container already has the right `MONGO_URI` — no environment variables needed on the host. Node.js and all dependencies are inside the image, so this works without any local `npm install`.

Expected output:
```
Connected to database: agentbuilder
  [insert] builtin_skill "caveman" (Caveman)
  ... (35 skills total)
  [insert] persona_category "technology" (Technology, 5 personas)
  ... (11 categories total)
Migration complete.
```

Re-running is safe — existing documents are skipped.

### 4. Open the app

```
http://localhost:3000
```

Click **Sign up** to create your account. The Marketplace and Skills pages are pre-populated.

---

## What Gets Seeded Automatically

On first `docker compose up`, both databases initialize without any extra steps:

### PostgreSQL (via `backend/db/init/`)

Scripts run in filename order. All are idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

| File | What it does |
|---|---|
| `01_schema.sql` | Core tables: `users`, `agents`, `custom_skills`, `subscriptions`, `agent_versions` |
| `02_performance_indexes.sql` | Composite indexes for list + filter queries |
| `03_users.sql` | Users table with email normalization |
| `04_ownership.sql` | Agent ownership columns |
| `05_subscriptions.sql` | Subscriptions join table |
| `06_agent_versions.sql` | Version history table |
| `07_marketplace.sql` | Full-text search vector, fork/favorite counters, search trigger |
| `08_ratings.sql` | Agent ratings table |
| `09_favorites.sql` | Favorites join table |
| `10_agent_events.sql` | Analytics event log |
| `11_tags.sql` | Tags JSONB column + GIN index on agents |
| `12_seed_agents.sql` | **130+ public seed agents** spanning research, engineering, security, marketing, education, and more |
| `13_jobs.sql` | Async job queue for webhook delivery |
| `13_tier.sql` | `tier` column on users; `usage_counters` quota table |
| `14_categories.sql` | Categories table; `category_id` FK on agents; 6 seed categories |
| `15_audit_log.sql` | Append-only compliance audit log |
| `16_admin_flag.sql` | `is_admin` column on users |
| `17_webhooks.sql` | Webhook registration table |
| `18_webhook_deliveries.sql` | Webhook delivery attempt log |
| `19_github_connections.sql` | GitHub OAuth connections (encrypted) |
| `20_agent_github_sync.sql` | Per-agent GitHub sync configuration |

### MongoDB (via `backend/db/mongo-init/`)

| File | What it does |
|---|---|
| `01_init.js` | Collections: `user_preferences`, `workspace_state`, `draft_agents` with indexes |
| `02_seed_templates.js` | 5 starter agent templates (Researcher, Code Assistant, Data Analyst, Customer Service, Blank) |

### One-time seed (step 3 above)

| Command | What it does |
|---|---|
| `docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js` | 35 built-in skills + 11 persona categories in MongoDB |

> **After `docker compose down -v`** (volume wipe): all auto-seeds replay on the next `up`. Re-run the exec command once for MongoDB skills/personas.

---

## Dev Mode (Hot Reload)

Run only the databases in Docker and the backend + frontend directly on your machine for fast iteration:

```bash
# Terminal 1 — start only the databases
docker compose --env-file .env.local up -d postgres mongodb

# Terminal 2 — backend with file-watch restart
cd backend
npm install
npm run dev        # starts on http://localhost:4000

# Terminal 3 — frontend dev server with HMR
cd frontend
npm install
npm run dev        # starts on http://localhost:5173

# Seed MongoDB (same as step 3 — only needed once, run while Docker DBs are up)
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js
```

The Vite dev server (`localhost:5173`) proxies all `/api/*` requests to the backend at `localhost:4000` — no CORS config needed.

The backend uses `backend/.env` for local DB connection strings — the defaults connect to the Docker databases on `localhost`.

---

## Common Commands

| Command | What it does |
|---|---|
| `docker compose --env-file .env.local up -d --build` | Build images and start all services |
| `docker compose --env-file .env.local up -d` | Start without rebuilding |
| `docker compose ps` | Show service status |
| `docker compose logs -f backend` | Stream backend logs |
| `docker compose logs -f` | Stream all logs |
| `docker compose restart backend` | Restart backend only |
| `docker compose build backend` | Rebuild backend image after source changes |
| `docker compose build frontend` | Rebuild frontend image after source changes |
| `docker compose down` | Stop containers, keep volumes |
| `docker compose --env-file .env.local down -v` | Stop containers and **delete all data** |

### Reset everything and start fresh

```bash
docker compose --env-file .env.local down -v
docker compose --env-file .env.local up -d --build

# Re-seed MongoDB (PostgreSQL seeds replay automatically)
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js
```

### Connect to databases directly

```bash
# PostgreSQL
docker compose --env-file .env.local exec postgres \
  psql -U agentforge -d agentforge

# MongoDB shell
docker compose --env-file .env.local exec mongodb \
  mongosh --username admin --password adminpassword \
  --authenticationDatabase admin agentbuilder
```

---

## Environment Variables

All variables have defaults in `docker-compose.yml`. Override any of them in `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | _(required)_ | Sign auth tokens — set to a long random string |
| `FRONTEND_PORT` | `3000` | Host port for the React app |
| `PORT` | `4000` | Backend API port |
| `POSTGRES_PORT` | `5432` | PostgreSQL host port |
| `POSTGRES_DB` | `agentforge` | Database name |
| `POSTGRES_USER` | `agentforge` | Database user |
| `POSTGRES_PASSWORD` | `agentforge` | Database password |
| `POSTGRES_POOL_MAX` | `10` | Max PG connection pool size |
| `POSTGRES_POOL_MIN` | `2` | Min idle PG connections |
| `MONGO_PORT` | `27017` | MongoDB host port |
| `MONGO_DB` | `agentbuilder` | MongoDB database name |
| `MONGO_ROOT_USERNAME` | `admin` | MongoDB root user |
| `MONGO_ROOT_PASSWORD` | `adminpassword` | MongoDB root password |
| `QUERY_TIMEOUT_MS` | `5000` | Per-query timeout in ms |
| `SLOW_QUERY_THRESHOLD_MS` | `1000` | Log queries slower than this |

**Port conflict?** Change the host-side port (`FRONTEND_PORT=3001`, `POSTGRES_PORT=5433`, etc.) in `.env.local`.

> Never commit `.env.local` — it is gitignored.

---

## Services

### PostgreSQL (`postgres`)

- **Image:** `postgres:14-alpine`
- **Host port:** `5432` (configurable via `POSTGRES_PORT`)
- **Volume:** `postgres_data`
- **Init:** `backend/db/init/` — all `.sql` files run once on first volume start

### MongoDB (`mongodb`)

- **Image:** `mongo:7.0`
- **Host port:** `27017` (configurable via `MONGO_PORT`)
- **Volume:** `mongo_data`
- **Init:** `backend/db/mongo-init/` — all `.js` files run once on first volume start

### Backend (`backend`)

- **Build:** `backend/Dockerfile`
- **Host port:** `4000`
- **Health check:** `GET /api/health` → `{"ok":true}`
- Waits for both databases to be healthy before starting

### Frontend (`frontend`)

- **Build:** `frontend/Dockerfile` (multi-stage: Vite → nginx)
- **Host port:** `3000`
- nginx proxies `/api/*` → `http://backend:4000` internally
- All other routes fall back to `index.html` for React client-side routing
- Waits for the backend to be healthy before starting

---

## Troubleshooting

**`docker` not found on Windows**
Docker Desktop installs the CLI to `C:\Program Files\Docker\Docker\resources\bin\`. Open a new terminal after Docker Desktop has started, or add that path to `PATH`.

**Port already in use**
Change the conflicting port in `.env.local` (e.g. `FRONTEND_PORT=3001`) and restart.

**Backend stuck in `starting` / health check failing**
On slow machines, increase `start_period` in `docker-compose.yml`. Check logs:
```bash
docker compose logs backend
```

**Seed script `Cannot find module` error**
Run the seed via `docker exec`, not bare `node` on the host. The host doesn't have `backend/node_modules` unless you've run `npm install` there:
```bash
docker compose --env-file .env.local exec backend node scripts/migrate-skills-personas.js
```

**No skills or personas in the app after a volume wipe**
Re-run the MongoDB seed script (step 3). PostgreSQL seed agents come back automatically.

**MongoDB init script did not run**
Init scripts only execute when the data volume is empty. Wipe and restart:
```bash
docker compose --env-file .env.local down -v
docker compose --env-file .env.local up -d --build
```

**`JWT_SECRET must be set in .env.local` error**
Copy the example file and set `JWT_SECRET`:
```bash
cp .env.local.example .env.local
# then edit JWT_SECRET
```

**Permission denied on Linux**
Add your user to the `docker` group or prefix commands with `sudo`. See the [Docker post-install docs](https://docs.docker.com/engine/install/linux-postinstall/).
