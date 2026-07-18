# Quota Policy

## Overview

AgentForge enforces per-user daily quotas to protect platform resources and support tier differentiation. Quotas are tracked in the `usage_counters` table and reset at midnight UTC each day.

## Tiers

| Tier | Exports / day | Saves / day |
|------|--------------|-------------|
| free | 10           | 50          |
| paid | unlimited    | unlimited   |

Limits are defined in `backend/src/quotaConfig.js` and can be tuned without touching route code.

## What Is Metered

| Action | Trigger | Metered? |
|--------|---------|----------|
| Agent save (create) | `POST /api/agents` | Authenticated users only |
| Agent save (update) | `PUT /api/agents/:id` | Authenticated users only |
| Export event | `POST /api/agents/:id/export-event` | Authenticated users only |
| Anonymous Markdown export | Same export-event endpoint, no token | **Never metered** |

## Anonymous Export Decision

Anonymous Markdown export (no login required) is intentionally unmetered. This is an adoption strategy: lowering friction for casual users to discover and share agents outweighs the marginal cost of untracked exports.

Anonymous exports are still subject to the existing IP-based rate limiter (100 req/min per IP), which provides general abuse protection. The per-user quota layer is a separate, orthogonal mechanism that only activates once a user is authenticated.

This decision should be revisited if anonymous export volume becomes a resource concern.

## Enforcement Mechanism

The `enforceQuota(action)` middleware in `backend/src/middleware/quota.js`:

1. Passes through immediately if `req.user` is absent (anonymous).
2. Fetches the user's `tier` from the `users` table.
3. For `paid` tier (or any tier with an `Infinity` limit): passes through without writing to `usage_counters`.
4. For `free` tier: atomically increments `usage_counters(user_id, action, CURRENT_DATE)` using `INSERT … ON CONFLICT DO UPDATE … RETURNING count`. This is a single round-trip and is safe under concurrent requests.
5. If the returned count exceeds the limit, returns **HTTP 429** with:
   ```json
   {
     "error": "Daily export limit reached",
     "limit": 10,
     "used": 11,
     "resetsAt": "2026-07-05T00:00:00.000Z",
     "tier": "free"
   }
   ```
6. If the quota check itself fails (DB error), the middleware logs the error and **passes through** rather than blocking the user. Quota is best-effort; it should not become a hard availability dependency.

## Quota API

`GET /api/me/quota` (requires authentication) returns the current user's tier and today's usage:

```json
{
  "tier": "free",
  "usage": {
    "export": { "used": 3, "limit": 10 },
    "save": { "used": 12, "limit": 50 }
  },
  "resetsAt": "2026-07-06T00:00:00.000Z"
}
```

The 429 response from `enforceQuota` includes `limit`, `used`, `resetsAt`, and `tier` so clients can display the exact overage.

## Counter Durability

Counters are stored in PostgreSQL (`usage_counters` table) and survive server restarts. The `period` column is a `DATE` (UTC) so counters automatically become stale the next day without any cleanup job — old rows are inert, not incorrect. A periodic cleanup of old rows (e.g., `DELETE FROM usage_counters WHERE period < CURRENT_DATE - INTERVAL '90 days'`) is recommended but not required for correctness.
