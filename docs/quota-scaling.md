# Quota Scaling — PostgreSQL vs. Redis

## Current approach: PostgreSQL `usage_counters`

The `usage_counters` table stores daily buckets per `(user_id, action, period)` and increments them with an atomic upsert:

```sql
INSERT INTO usage_counters (user_id, action, period, count)
VALUES ($1, $2, CURRENT_DATE, 1)
ON CONFLICT (user_id, action, period)
DO UPDATE SET count = usage_counters.count + 1;
```

**Why this is correct for low-to-medium scale:**

- Single atomic statement — no read-then-write race.
- Survives process restarts and multi-instance deployments because the counter lives in the database, not memory.
- No extra infrastructure: works with the existing PostgreSQL container.
- `ON CONFLICT DO UPDATE` uses a row-level lock; concurrent increments serialize safely at the row level.

**When it starts to strain:**

| Signal | Threshold (rough) |
|---|---|
| Counter-update latency | > 5 ms p99 under load |
| PostgreSQL CPU from WAL writes | > 40 % sustained |
| Requests that touch a counter | > ~2 000 / s sustained |

At those levels, the WAL amplification from frequent tiny updates to `usage_counters` creates measurable write pressure.

---

## Redis upgrade path

Redis `INCR` + key TTL is the idiomatic high-throughput counter. Each key encodes the bucket:

```
usage:{user_id}:{action}:{YYYY-MM-DD}
```

### Increment pattern

```js
const key = `usage:${userId}:${action}:${date}`;   // e.g. usage:abc123:export:2026-07-04
const count = await redis.incr(key);
// Set TTL only on creation so subsequent INCRs don't reset it.
if (count === 1) {
  await redis.expire(key, 90 * 24 * 60 * 60);  // 90-day TTL
}
```

`INCR` is atomic by the Redis single-threaded model; no locking needed.

### Quota check

```js
const count = parseInt(await redis.get(key) ?? '0', 10);
if (count >= FREE_TIER_DAILY_LIMIT) {
  return res.status(429).json({ error: 'quota_exceeded' });
}
```

### Migration steps

1. **Add Redis to `docker-compose.yml`:**

```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 3
```

2. **Install client** (`npm install ioredis`) and create `backend/src/redis.js`:

```js
import Redis from 'ioredis';

const client = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

export default client;
```

3. **Replace the PostgreSQL upsert** in the quota middleware with the `INCR` pattern above.

4. **Keep `usage_counters` as an audit log** (optional): write to both stores during a transition period, then drop the Postgres writes once Redis is confirmed stable.

5. **Eviction policy:** set `maxmemory-policy allkeys-lru` if memory is constrained. For usage counters this is acceptable — a missed increment under memory pressure is preferable to a crash. For strict enforcement, use `noeviction` and monitor memory.

### Trade-offs

| | PostgreSQL | Redis |
|---|---|---|
| Durability | Full WAL + ACID | AOF/RDB (configurable) |
| Throughput | ~2 000 writes/s sustained | ~100 000+ writes/s |
| Infrastructure | Already present | New dependency |
| Restart safety | Survives any restart | Survives with AOF (`appendonly yes`) |
| Multi-instance safe | Yes (row lock) | Yes (single-threaded INCR) |
| Operational cost | Low | Medium (memory sizing, eviction tuning) |

### Recommended threshold for migration

Switch when sustained counter-write throughput exceeds **~1 500 requests/s** or PostgreSQL write latency for counter upserts exceeds **5 ms p99**. Below that level, the PostgreSQL approach is simpler and has fewer failure modes.
