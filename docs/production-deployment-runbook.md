# Production Deployment Runbook

Step-by-step guide for deploying AgentForge to production, verifying success, and rolling back if needed.

**Audience:** On-call engineers and release owners  
**Time required:** 20–40 minutes (automated pipeline) + 10 minutes of validation  
**Target downtime:** 0 seconds (rolling restart) or < 1 second (blue-green)

---

## Pre-Deployment Checklist

Complete every item before triggering a production deploy. If any item cannot be confirmed, **do not deploy**.

### Code readiness

- [ ] Version tag created: `git tag v<major>.<minor>.<patch>` and pushed
- [ ] PR merged and CI green on `main` (all jobs in `test.yml` passing)
- [ ] Staging deployment completed successfully (see `ci-cd.yml` staging gate)
- [ ] Smoke tests passed on staging (`/api/health`, `/api/health/mongo`, agent CRUD)
- [ ] No open P0/P1 incidents in the current environment

### Data readiness

- [ ] Current production PostgreSQL row counts noted (for post-deploy comparison):
  ```bash
  curl https://agentforge.example.com/api/metrics | jq '{agents: .requests_total}'
  # or SSH in:
  docker compose exec postgres psql -U agentforge -d agentforge \
    -c "SELECT COUNT(*) FROM agents; SELECT COUNT(*) FROM custom_skills;"
  ```
- [ ] Any required schema migration files added to `backend/db/init/` and applied in staging
- [ ] Migration validated in staging: no errors, row counts match expectations

### Infrastructure readiness

- [ ] Disk space > 20% free on production host
  ```bash
  df -h /var/lib/docker
  ```
- [ ] At least 2× container memory headroom available (blue-green requires two containers)
- [ ] Backup storage reachable (GitHub Actions artifacts or S3 bucket)

### Communication

- [ ] Maintenance window communicated to stakeholders (use template below)
- [ ] On-call engineer confirmed and reachable

---

## Deployment Steps

### Step 1 — Trigger the pipeline

The `ci-cd.yml` workflow triggers automatically when a version tag is pushed:

```bash
# On your local machine
git checkout main
git pull
git tag v1.2.3
git push origin v1.2.3
```

This starts the full pipeline:
1. Tests with real databases
2. Docker image build and push
3. Production backup
4. Production deploy
5. Health validation

Monitor at: **Actions → CI/CD Pipeline → [your run]**

### Step 2 — Monitor the production deploy job

Watch the `deploy-production` job logs for:

```
✓ docker pull ...agentforge-backend:v1.2.3
✓ docker compose up -d --no-deps --wait backend
✓ curl http://localhost:4000/api/health   → {"ok":true}
✓ curl http://localhost:4000/api/health/mongo  → {"ok":true}
```

If the job fails, see [Rollback Procedure](#rollback-procedure) below.

### Step 3 — Post-deployment validation

Run these checks **within 5 minutes of the deploy completing**.

#### Automated health checks

```bash
BASE=https://agentforge.example.com

# PostgreSQL health
curl -sf "$BASE/api/health" | grep '"ok":true'          && echo "PG OK"

# MongoDB health
curl -sf "$BASE/api/health/mongo" | grep '"ok":true'    && echo "Mongo OK"

# Metrics (confirms process is running)
curl -sf "$BASE/api/metrics" | jq '{uptime: .uptime_seconds, errors: .errors_total}'
```

#### Data integrity checks

```bash
# Agent count should match pre-deploy count
curl -sf "$BASE/api/agents" | jq 'length'

# Tools catalog intact
curl -sf "$BASE/api/tools" | jq 'length'
```

#### Performance baseline validation

```bash
# Avg response time should be within 2× of pre-deploy baseline
curl -sf "$BASE/api/metrics" | jq '.avg_duration_ms'
```

Typical baseline: **< 50ms** for `/api/agents`. Alert threshold: **> 200ms** sustained.

#### Browser smoke test

1. Open `https://agentforge.example.com` in a private browser window
2. Confirm the canvas loads (no JavaScript errors in console)
3. Create a test agent ("deploy-smoke-test") — confirm it saves and appears in the sidebar
4. Delete the test agent

### Step 4 — Monitor for 15 minutes

After validation, monitor for 15 minutes before closing the deployment:

```bash
# Tail backend logs on production host
docker compose logs -f backend | grep -E '\[ERROR\]|5[0-9]{2}'
```

Check `/api/metrics` every 5 minutes:
- `error_rate` should be `< 0.01` (1%)
- `avg_duration_ms` should be `< 200`

---

## Rollback Procedure

If **any** post-deployment validation fails, roll back immediately. Do not spend time debugging in production.

### Automated rollback (preferred — < 5 minutes)

1. Go to **GitHub → Actions → Rollback Deployment → Run workflow**
2. Set:
   - `environment`: `production`
   - `image_tag`: the previous stable tag (e.g. `v1.2.2`) — leave blank to auto-detect
   - `reason`: brief description (e.g. "error rate spike after v1.2.3 deploy")
3. Click **Run workflow**
4. Monitor the `rollback` job — it will:
   - Download and validate the pre-deploy backup
   - Restore PostgreSQL and MongoDB
   - Pull the previous image and restart the container
   - Validate health endpoints

### Manual rollback (if GitHub Actions is unavailable)

```bash
ssh deploy@<production-host>
cd /opt/agentforge

# 1. Identify previous stable image
docker images docker.io/<user>/agentforge-backend \
  --format "{{.Tag}}\t{{.CreatedAt}}" | grep -v sha- | head -5

# 2. Roll back to previous image
IMAGE="docker.io/<user>/agentforge-backend:v1.2.2"
docker pull "$IMAGE"
sed -i "s|image: .*agentforge-backend.*|image: $IMAGE|g" docker-compose.override.yml
docker compose up -d --no-deps --wait backend

# 3. Verify
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/mongo
```

If database restore is also needed:

```bash
cd /opt/agentforge/backend

# List available backups
ls -lth backups/postgresql/ | head -10

# Restore (the pre-deploy backup is tagged with the version)
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>-pre-v1.2.3.json

# If MongoDB also needs restore
node scripts/rollback-migration.js \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>-pre-v1.2.3.json \
  --mongo-only
```

### Rollback validation

```bash
BASE=https://agentforge.example.com
curl -sf "$BASE/api/health"       | grep '"ok":true' && echo "PG OK"
curl -sf "$BASE/api/health/mongo" | grep '"ok":true' && echo "Mongo OK"
curl -sf "$BASE/api/agents"       | jq 'length'
```

---

## Post-Deployment Validation Checklist

Complete after every successful deployment.

- [ ] `GET /api/health` returns `{"ok":true}` (HTTP 200)
- [ ] `GET /api/health/mongo` returns `{"ok":true}` (HTTP 200)
- [ ] `GET /api/agents` returns array with expected count
- [ ] `GET /api/tools` returns tool catalog (non-empty)
- [ ] `GET /api/metrics` — `error_rate` < 0.01, `avg_duration_ms` < 200
- [ ] Browser smoke test — agent create/delete succeeds
- [ ] No `[ERROR]` lines in backend logs for 15 minutes post-deploy
- [ ] PostgreSQL pool state healthy: `pg_pool.waiting` = 0

---

## Monitoring and Alerting

### Application monitoring

| Check | Endpoint | Alert condition |
|-------|----------|----------------|
| Backend health | `GET /api/health` | Any non-200 response |
| MongoDB health | `GET /api/health/mongo` | Any non-200 response |
| Error rate | `GET /api/metrics` → `error_rate` | > 0.01 (1%) |
| Response time | `GET /api/metrics` → `avg_duration_ms` | > 500ms |

**Recommended polling interval:** 60 seconds (use UptimeRobot, Pingdom, or similar).

### Database monitoring

```bash
# PostgreSQL — connection pool saturation
curl /api/metrics | jq '.pg_pool'
# Alert if .waiting > 0 for more than 30 seconds

# PostgreSQL — slow queries (logged by the backend)
docker compose logs backend | grep "Slow query"

# MongoDB — collection health
docker compose exec mongodb mongosh \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin agentforge \
  --eval "db.runCommand({serverStatus:1}).connections"
```

### Performance dashboards

The `/api/metrics` endpoint exposes data suitable for scraping into Grafana or Datadog:

```json
{
  "uptime_seconds": 86400,
  "requests_total": 10000,
  "errors_total": 5,
  "error_rate": "0.0005",
  "avg_duration_ms": 42,
  "pg_pool": { "total": 5, "idle": 3, "waiting": 0 },
  "rate_limiter": { "tracked_ips": 12 }
}
```

**Prometheus scrape config example:**

```yaml
scrape_configs:
  - job_name: agentforge
    static_configs:
      - targets: ['agentforge.example.com']
    metrics_path: /api/metrics
    scrape_interval: 60s
```

### Alert configurations

Configure the following alerts in your monitoring tool:

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Backend down | `/api/health` non-200 for 2 consecutive checks | P0 | Page on-call immediately |
| MongoDB down | `/api/health/mongo` non-200 for 2 consecutive checks | P1 | Page on-call |
| High error rate | `error_rate` > 0.01 for 5 minutes | P1 | Investigate, consider rollback |
| High latency | `avg_duration_ms` > 500 for 5 minutes | P2 | Check PG pool and slow queries |
| Disk > 80% | Docker volume usage | P2 | Prune backups and images |

---

## Communication Templates

### Pre-deployment notice

> **Subject:** AgentForge maintenance — [DATE] [TIME] UTC
>
> We will deploy AgentForge v[VERSION] on [DATE] at [TIME] UTC.
>
> **Expected impact:** None (rolling restart — < 30 seconds risk window)
>
> **What's changing:** [brief description from release notes]
>
> **Rollback plan:** Automated rollback available; < 5 minutes to restore previous version.
>
> Questions? Contact [on-call contact].

### Post-deployment success

> **Subject:** AgentForge v[VERSION] deployed successfully ✓
>
> Deployment completed at [TIME] UTC. All health checks passing.
>
> **Version:** [VERSION]
> **Deployed by:** [GitHub Actions run URL]
> **Status:** All systems operational

### Rollback notice

> **Subject:** AgentForge rollback in progress — [DATE] [TIME] UTC
>
> We encountered an issue with AgentForge v[VERSION] and are rolling back to v[PREVIOUS_VERSION].
>
> **Impact:** Service may be degraded for up to 5 minutes.
>
> **Estimated resolution:** [TIME] UTC
>
> We will send an update once rollback is confirmed successful.

### Rollback complete

> **Subject:** AgentForge rollback complete — service restored
>
> AgentForge has been rolled back to v[PREVIOUS_VERSION] at [TIME] UTC.
>
> All health checks are passing. We will investigate the root cause and re-deploy when the issue is resolved.
>
> **Next steps:** [RCA timeline, e.g. "Root cause analysis within 24 hours"]

---

## On-Call Procedures

### Incident response

1. **Detect** — alert fires or engineer notices degradation
2. **Assess** — check `/api/health`, `/api/health/mongo`, recent logs (< 2 minutes)
3. **Decide** — if error rate > 1% or health check failing: rollback immediately; do not debug in production
4. **Execute** — trigger `rollback.yml` or manual procedure
5. **Communicate** — send rollback notice using template above
6. **Confirm** — validate rollback success, send "rollback complete" notice
7. **RCA** — file a post-mortem within 24 hours

### Escalation path

| Condition | Contact |
|-----------|---------|
| Health checks failing | Primary on-call engineer |
| Rollback fails | Secondary on-call + team lead |
| Data loss suspected | Team lead + data owner immediately |
| > 30 minutes unresolved | Escalate to full team |

---

## Related Documents

- [CI/CD Pipeline](cicd-pipeline.md) — Workflow configuration and secrets setup
- [Zero-Downtime Deployment](zero-downtime-deployment.md) — Blue-green, canary, and graceful shutdown
- [Runbook](runbook.md) — Day-to-day operations and troubleshooting
- [Disaster Recovery](disaster-recovery.md) — Backup and restore procedures
- [Deployment Guide](deployment-guide.md) — Initial environment setup
