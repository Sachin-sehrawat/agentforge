# AgentForge Performance Testing

Load testing for the PostgreSQL and MongoDB-backed API using [k6](https://k6.io/).

## Prerequisites

Install k6 from https://k6.io/docs/get-started/installation/

```bash
# macOS
brew install k6

# Windows (via Chocolatey)
choco install k6

# Docker
docker pull grafana/k6
```

## Quick Start

Make sure the backend is running (`docker compose up` or `npm run dev` in `backend/`), then:

```bash
cd performance/k6

# Smoke test — 5 VUs, 1.5 min
k6 run scenarios/agents.js

# Load test — 100 concurrent users (default)
SCENARIO=load_100 k6 run scenarios/agents.js

# 500 concurrent users
SCENARIO=load_500 k6 run scenarios/agents.js

# Full mixed-traffic suite (agents + preferences + workspace)
k6 run scenarios/full-suite.js
```

## Scenarios

| File | Endpoints Tested | Acceptance Target |
|------|-----------------|-------------------|
| `scenarios/agents.js` | `GET/POST/PUT/DELETE /api/agents` | p95 < 200ms |
| `scenarios/preferences.js` | `GET/POST /api/preferences/:userId` | p95 < 100ms |
| `scenarios/workspace.js` | `GET/POST /api/workspace`, `GET/POST/DELETE /api/drafts` | p95 < 150ms |
| `scenarios/full-suite.js` | All of the above, realistic traffic split | Per-endpoint targets |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:4000` | Target server URL |
| `SCENARIO` | `load_100` | Load profile: `smoke`, `load_100`, `load_500`, `load_1000`, `spike`, `soak` |

## Load Profiles

| Profile | VUs | Duration | Purpose |
|---------|-----|----------|---------|
| `smoke` | 5 | 1.5 min | Sanity check |
| `load_100` | 100 | ~9 min | Baseline throughput |
| `load_500` | 500 | ~14 min | Peak daytime load |
| `load_1000` | 1000 | ~19 min | Stress / capacity ceiling |
| `spike` | 0 → 1000 | ~5 min | Sudden traffic event |
| `soak` | 100 | ~2.2 hr | Memory leak / connection exhaustion |

## Rate Limiting Note

The `preferences`, `workspace`, and `drafts` endpoints are rate-limited to **100 requests per IP per minute**. When running high-concurrency tests from a single machine, the `*_rate_limit_hits` counter will be non-zero — this is expected and these are excluded from the error rate threshold. For accurate p95 benchmarks above 100 VUs, run k6 from multiple hosts or use k6 Cloud distributed execution.

## Running with Docker

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:4000 \
  grafana/k6 run - < scenarios/agents.js
```

## Viewing Results

k6 prints a summary after each run. For a persistent dashboard:

```bash
# Output to InfluxDB + Grafana
k6 run --out influxdb=http://localhost:8086/k6 scenarios/agents.js

# Output to CSV for spreadsheet analysis
k6 run --out csv=results.csv scenarios/agents.js
```

## Interpreting Output

Key metrics to watch:

- `http_req_duration` — overall request latency
- `agent_list_duration_ms` / `pref_get_duration_ms` / `ws_get_duration_ms` — per-operation latencies
- `http_req_failed` — 5xx error rate (should be < 1%)
- `*_rate_limit_hits` — 429 rate-limit counter (expected at high concurrency from a single IP)
- `pg_pool` via `GET /api/metrics` — PostgreSQL connection pool saturation
