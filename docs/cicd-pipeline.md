# CI/CD Pipeline

Overview of the GitHub Actions workflows that test, build, and deploy AgentForge.

---

## Workflow Map

```
Pull Request ──► test.yml ──────────────────────────────────► (merge gate)
                    │
                    ▼
Push to main ──► ci-cd.yml
                    │
                    ├── 1. test          (PostgreSQL + MongoDB services)
                    ├── 2. build         (Docker image → Docker Hub)
                    ├── 3. backup-staging
                    ├── 4. deploy-staging (health + smoke tests)
                    └── (tag v*.*.* only)
                              │
                              └── 5. deploy-production (manual gate)

Manual trigger ──► rollback.yml   (any environment, any image tag)
```

---

## Workflows

### `test.yml` — PR Gate

Runs on every push to `main`/`develop` and on all pull requests.

| Job | What it does |
|-----|-------------|
| `backend-tests` | Spins up PostgreSQL 14 and MongoDB 7.0 service containers, applies the full schema, then runs `npm run test:coverage` |
| `frontend-tests` | Runs Vitest with coverage in the frontend workspace |
| `lint-check` | Builds the frontend — catches import errors and type issues |
| `coverage-report` | Posts a coverage summary comment to the PR |

**Coverage thresholds** (enforced by Vitest, pipeline fails if not met):
- Lines / Functions / Statements: 90%
- Branches: 85%

---

### `ci-cd.yml` — Build and Deploy

Runs on pushes to `main` and version tags (`v*.*.*`).

| Job | Trigger | What it does |
|-----|---------|-------------|
| `test` | Always | Full test suite with real databases (same as `test.yml`) |
| `build` | After `test` passes | Builds Docker image, tags with semver + SHA, pushes to Docker Hub |
| `backup-staging` | `main` push | Backs up staging PostgreSQL + MongoDB, verifies backup integrity |
| `deploy-staging` | After backup | Rolling restart of staging, schema validation, smoke tests |
| `deploy-production` | Version tag `v*.*.*` only | Backs up production, rolling restart, health checks |

**Image tagging strategy:**

| Tag | Example | When |
|-----|---------|------|
| Semver | `v1.2.3` | On `git tag v1.2.3` |
| Major.minor | `v1.2` | On version tag |
| Branch | `main` | On push to main |
| Short SHA | `sha-a1b2c3d` | Always |
| `latest` | `latest` | Only on default branch |

---

### `rollback.yml` — Emergency Rollback

Manual trigger only. Target: **< 5 minutes** from trigger to confirmed healthy state.

Inputs:
- `environment` — `staging` or `production`
- `image_tag` — Docker tag to roll back to. Leave blank to auto-detect the previous stable tag.
- `reason` — Written to the deployment summary for audit purposes.

Steps:
1. Resolve target image tag
2. Download the most recent backup artifact from GitHub Actions
3. Validate backup integrity (`--dry-run`)
4. Restore PostgreSQL (if backup available)
5. Restore MongoDB (if backup available)
6. Pull and restart container with the target image
7. Validate `/api/health` and `/api/health/mongo` return `{"ok":true}`

See [zero-downtime-deployment.md](zero-downtime-deployment.md) for the full rollback decision tree.

---

## Required Secrets

Configure these in **Settings → Secrets and variables → Actions** before enabling the pipeline.

### Docker Hub

| Secret | Description |
|--------|-------------|
| `DOCKER_HUB_USERNAME` | Docker Hub account username |
| `DOCKER_HUB_TOKEN` | Docker Hub access token (read/write) — generate at hub.docker.com → Account Settings → Security |

### Staging environment

| Secret / Variable | Type | Description |
|-------------------|------|-------------|
| `STAGING_HOST` | Secret | IP or hostname of staging server |
| `STAGING_SSH_USER` | Secret | SSH username |
| `STAGING_SSH_KEY` | Secret | Private key for SSH access (RSA or Ed25519) |
| `STAGING_POSTGRES_URL` | Secret | Full DSN: `postgresql://user:pass@host:5432/db` |
| `STAGING_MONGO_URI` | Secret | Full URI: `mongodb://user:pass@host:27017/db?authSource=admin` |
| `STAGING_URL` | Variable | Public base URL of staging: `https://staging.agentforge.example.com` |

### Production environment

| Secret / Variable | Type | Description |
|-------------------|------|-------------|
| `PROD_HOST` | Secret | IP or hostname of production server |
| `PROD_SSH_USER` | Secret | SSH username |
| `PROD_SSH_KEY` | Secret | Private key for SSH access |
| `PROD_POSTGRES_URL` | Secret | Full PostgreSQL DSN |
| `PROD_MONGO_URI` | Secret | Full MongoDB URI |
| `PRODUCTION_URL` | Variable | Public base URL: `https://agentforge.example.com` |

> **Never** commit credentials to the repository. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) to rotate and inject secrets into GitHub.

---

## Environment Gating

Environments (`staging`, `production`) are configured in **Settings → Environments**. Each environment can have:

- **Required reviewers** — production deploys require approval before running.
- **Wait timer** — add a 10-minute soak period before production deploy starts.
- **Deployment branches** — restrict to `main` or version tags.

Recommended settings:

| Environment | Required reviewers | Deployment branches |
|-------------|-------------------|---------------------|
| staging | None | `main` |
| production | 1 (team lead or on-call) | Tags matching `v*.*.*` |

---

## Database Migration in CI

Schema changes are managed via SQL files in `backend/db/init/`. The pipeline applies them in order before running tests:

```
01_schema.sql             — tables, primary keys, baseline indexes
02_performance_indexes.sql — GIN / composite indexes added post-launch
```

**Adding a new migration:**
1. Create `backend/db/init/03_<description>.sql` with idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
2. The test workflow applies it automatically.
3. For production, it runs on first container start via Docker's `docker-entrypoint-initdb.d/` mechanism (or apply manually via `psql`).

---

## Monitoring the Pipeline

- **GitHub Actions tab** — real-time job logs and artifact downloads.
- **Deployment summaries** — each deploy job writes a summary to the GitHub workflow run page (image tag, digest, URL).
- **Coverage artifacts** — retained for 14 days under `backend-coverage` and `frontend-coverage`.
- **Backup artifacts** — staging backups retained 30 days; production backups 90 days.

---

## Related Documents

- [Zero-Downtime Deployment](zero-downtime-deployment.md) — Blue-green and canary strategies
- [Production Deployment Runbook](production-deployment-runbook.md) — Step-by-step deployment and rollback
- [Docker Setup](docker-setup.md) — Local development environment
- [Deployment Guide](deployment-guide.md) — Environment variables and initial setup
