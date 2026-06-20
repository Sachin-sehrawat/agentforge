# Zero-Downtime Deployment

Strategies and procedures for deploying AgentForge without dropping requests or losing data.

---

## Overview

AgentForge uses a **stateless backend** (Express) with **stateful databases** (PostgreSQL, MongoDB). Zero-downtime means:

1. The API continues serving requests throughout the deployment.
2. No database writes are lost during the switch.
3. A failed deployment is rolled back within **5 minutes**.

---

## Strategy 1 — Rolling Restart (Default)

Docker Compose restarts one container at a time, and the health check gate ensures the new container is healthy before the old one is removed.

```
[current container]  ──►  [new container starting]
                                    │ health check passes
                     ◄──────────────┘
[old container stops]
```

### How it works in practice

The `ci-cd.yml` pipeline runs:

```bash
docker compose up -d --no-deps --wait backend
```

`--wait` blocks until the container's HEALTHCHECK passes. Docker's 15-second `start_period` absorbs the warm-up time. If the health check never passes, Compose exits non-zero and the pipeline fails — the old container keeps running.

### Health check

The `Dockerfile` includes:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -fs http://localhost:4000/api/health | grep '"ok":true' || exit 1
```

The `/api/health` endpoint queries PostgreSQL (`SELECT 1`). If PostgreSQL is unreachable, the container is marked unhealthy and Docker restarts it automatically.

### Limitations

- Single-host setup: there is a **≈15-second window** between old container stopping and new container passing its first health check during which no backend is reachable.
- Acceptable for current traffic volumes. Upgrade to blue-green (below) when SLO requires < 1s downtime.

---

## Strategy 2 — Blue-Green Deployment

Two identical stacks run in parallel. Traffic switches atomically from the "blue" (current) to the "green" (new) environment via a load balancer or reverse proxy.

```
             ┌─────────────────────┐
             │   Nginx / Traefik   │
             └─────────┬───────────┘
                        │
          ┌─────────────▼──────────────┐
          │                            │
   [blue backend :4000]        [green backend :4001]
   [blue postgres]              [green postgres] ◄── identical replica
   [blue mongodb ]              [green mongodb ] ◄── identical replica
```

### Setup

1. **Provision two stacks** using Docker Compose profiles or separate Compose files:

   ```bash
   # Blue stack (currently live)
   docker compose -p agentforge-blue up -d

   # Green stack (receives the new deployment)
   docker compose -p agentforge-green up -d
   ```

2. **Configure Nginx** to route all traffic to blue:

   ```nginx
   upstream agentforge {
       server 127.0.0.1:4000;  # blue
   }
   ```

3. **Deploy to green** without touching blue:

   ```bash
   docker compose -p agentforge-green pull backend
   docker compose -p agentforge-green up -d --no-deps --wait backend
   ```

4. **Smoke test green**:

   ```bash
   curl http://localhost:4001/api/health
   curl http://localhost:4001/api/health/mongo
   # Run full smoke suite against port 4001
   ```

5. **Atomic traffic switch** — update Nginx upstream and reload:

   ```bash
   sed -i 's/127.0.0.1:4000/127.0.0.1:4001/' /etc/nginx/conf.d/agentforge.conf
   nginx -s reload   # zero-downtime config reload
   ```

6. **Keep blue running** for 10 minutes as a hot standby. If issues arise, revert Nginx and reload.

7. **Tear down blue** once green is confirmed stable:

   ```bash
   docker compose -p agentforge-blue down
   ```

### Database considerations

- PostgreSQL and MongoDB do **not** need to be duplicated if the application schema is backwards-compatible.
- Both blue and green backends can point to the **same** database instances during the switch window.
- Apply schema migrations before switching traffic (migrations must be additive and backwards-compatible).

---

## Strategy 3 — Canary Deployment

Route a small percentage of traffic to the new version and expand gradually.

```
100% ──► [blue]     (initial state)
 95% ──► [blue]
  5% ──► [green]    (canary)  ◄── monitor error rate
 50% ──► [blue]
 50% ──► [green]    (ramp)
  0% ──► [blue]
100% ──► [green]    (complete)
```

### Nginx weighted upstream example

```nginx
upstream agentforge {
    server 127.0.0.1:4000 weight=95;   # blue (current)
    server 127.0.0.1:4001 weight=5;    # green (canary)
}
```

Increase the green weight progressively:

```bash
# Ramp to 50/50
sed -i 's/weight=5/weight=50/' /etc/nginx/conf.d/agentforge.conf
nginx -s reload

# Monitor /api/metrics for error_rate — if OK, go 100% green
```

### Canary abort criteria

Roll back immediately if any of these conditions are observed on the canary traffic:

| Signal | Threshold |
|--------|-----------|
| `error_rate` from `/api/metrics` | > 1% |
| `avg_duration_ms` from `/api/metrics` | > 2× baseline |
| `GET /api/health` returns non-200 | Any |
| 5xx responses in logs | > 0.5% of requests |

---

## Graceful Shutdown

The backend must drain in-flight requests before the process exits. The `Dockerfile` uses **tini** as PID 1:

```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
```

Tini forwards `SIGTERM` to Node.js. Express and the `pg` pool handle the signal correctly — the process exits after finishing in-flight requests (typically < 100ms).

Docker's default stop grace period is **10 seconds**. If requests take longer, increase it in `docker-compose.yml`:

```yaml
services:
  backend:
    stop_grace_period: 30s
```

---

## Health Check Endpoints

| Endpoint | Checks | Success response |
|----------|--------|-----------------|
| `GET /api/health` | PostgreSQL (`SELECT 1`) | `{"ok":true}` |
| `GET /api/health/mongo` | MongoDB (`ping`) | `{"ok":true}` |
| `GET /api/metrics` | In-process counters + PG pool | JSON metrics object |

Both `/api/health` endpoints return HTTP 503 when the database is unreachable. Configure your load balancer or reverse proxy to route traffic away from unhealthy instances using these endpoints.

**Suggested load balancer health check config:**

```
path:     /api/health
interval: 15s
timeout:  5s
healthy:  2 consecutive successes
unhealthy: 2 consecutive failures
```

---

## Rollback Decision Tree

```
Deploy triggered
        │
        ▼
Health check passes within 15s?
  ├── YES ──► Smoke tests pass?
  │               ├── YES ──► Deploy complete ✓
  │               └── NO  ──► Trigger rollback.yml immediately
  └── NO  ──► Docker Compose exits non-zero
                  │
                  └── Old container still running? (rolling restart)
                          ├── YES ──► No customer impact; fix and redeploy
                          └── NO  ──► Trigger rollback.yml immediately
```

### Rollback triggers

Trigger `rollback.yml` when:
- Pipeline fails after new container starts serving traffic.
- Error rate on `/api/metrics` spikes > 1% post-deploy.
- On-call receives alerts indicating degraded service.
- Manual decision after a bad deploy (e.g., data corruption, API regression).

### Quick rollback via GitHub Actions

1. Go to **Actions → Rollback Deployment → Run workflow**
2. Choose `environment`, optionally specify `image_tag`, enter `reason`
3. Target completion: **< 5 minutes**

### Emergency manual rollback (without GitHub Actions)

If GitHub Actions is unavailable:

```bash
ssh deploy@<host>
cd /opt/agentforge

# List recent images
docker images agentforge-backend --format "{{.Tag}}\t{{.CreatedAt}}" | head -10

# Roll back to a specific tag
IMAGE="docker.io/<user>/agentforge-backend:v1.2.3"
docker pull "$IMAGE"
sed -i "s|image: .*agentforge-backend.*|image: $IMAGE|g" docker-compose.override.yml
docker compose up -d --no-deps --wait backend

# Verify
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/mongo
```

Then restore the database if needed:

```bash
cd /opt/agentforge/backend
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/<pre-deploy-backup>.json
```

---

## SLO Targets

| Metric | Target |
|--------|--------|
| Availability | ≥ 99.5% monthly |
| Rolling restart downtime | < 30 seconds |
| Blue-green switch downtime | < 1 second |
| Rollback completion | < 5 minutes |
| Backup before deploy | Always (enforced by pipeline) |

---

## Related Documents

- [CI/CD Pipeline](cicd-pipeline.md) — Workflow configuration and secrets
- [Production Deployment Runbook](production-deployment-runbook.md) — Step-by-step checklist
- [Disaster Recovery](disaster-recovery.md) — Backup and restore procedures
- [Runbook](runbook.md) — Day-to-day operations
