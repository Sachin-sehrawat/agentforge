









# Database Schema

AgentForge uses **PostgreSQL 14+** as its primary relational data store and **MongoDB 7.0** for document-shaped operational data. All PostgreSQL init scripts run automatically in filename order when the Docker volume is first created (`backend/db/init/`).

## PostgreSQL Init Scripts

| File | Contents |
|---|---|
| `01_schema.sql` | Core tables: `agents`, `custom_skills`, `users`, `subscriptions`, `agent_versions` |
| `02_performance_indexes.sql` | Additional composite and GIN indexes |
| `03_users.sql` | User-related constraints and indexes |
| `04_ownership.sql` | Ownership columns backfill |
| `05_subscriptions.sql` | Subscription constraints |
| `06_agent_versions.sql` | Version history table |
| `07_marketplace.sql` | Marketplace columns: `search_tsv`, `fork_count`, `favorite_count`, `rating_sum`, `rating_count`, `forked_from`; full-text search trigger |
| `08_ratings.sql` | `agent_ratings` table |
| `09_favorites.sql` | `agent_favorites` table |
| `10_agent_events.sql` | `agent_events` append-only event log |
| `11_tags.sql` | `tags` JSONB column + GIN index on `agents` |
| `12_seed_agents.sql` | 130+ public seed agents spanning diverse use cases |
| `13_jobs.sql` | `jobs` table for async webhook delivery queue |
| `13_tier.sql` | `tier` column on `users`; `usage_counters` table for quota tracking |
| `14_categories.sql` | `categories` table; `category_id` FK on `agents`; 6 seed categories |
| `15_audit_log.sql` | `audit_log` append-only compliance table |
| `16_admin_flag.sql` | `is_admin` boolean column on `users` |
| `17_webhooks.sql` | `webhooks` table |
| `18_webhook_deliveries.sql` | `webhook_deliveries` table |
| `19_github_connections.sql` | `github_connections` table (AES-256-GCM encrypted OAuth tokens) |
| `20_agent_github_sync.sql` | `agent_github_sync` per-agent GitHub sync configuration |

## PostgreSQL Tables

### `agents`

Stores agent configurations created in the visual builder.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Unique agent identifier |
| `name` | `TEXT` | `NOT NULL` | Human-readable agent name |
| `persona` | `TEXT` | `NOT NULL DEFAULT ''` | Agent persona / role description |
| `system_prompt` | `TEXT` | `NOT NULL DEFAULT ''` | Base system prompt for the agent |
| `model` | `TEXT` | `NOT NULL DEFAULT 'claude-sonnet-4-6'` | Target model identifier |
| `tools` | `JSONB` | `NOT NULL DEFAULT '[]'` | Array of enabled tool IDs |
| `positions` | `JSONB` | `NOT NULL DEFAULT '{}'` | Canvas node positions `{ nodeId: { x, y } }` |
| `skills` | `JSONB` | `NOT NULL DEFAULT '[]'` | Array of custom skill IDs attached to the agent |
| `instructions` | `JSONB` | `NOT NULL DEFAULT '[]'` | Ordered array of instruction strings |
| `owner_id` | `UUID` | nullable, FK → `users.id` ON DELETE SET NULL | Owning user; NULL for legacy rows created before ownership was introduced |
| `visibility` | `TEXT` | `NOT NULL DEFAULT 'private'` CHECK (`'public'`\|`'private'`) | Access level; existing rows were backfilled to `'public'` |
| `search_tsv` | `tsvector` | nullable | Full-text search vector maintained by `trg_agents_search_tsv` trigger (name weight A, persona weight B, system_prompt weight C) |
| `fork_count` | `INTEGER` | `NOT NULL DEFAULT 0` | Number of times this agent has been forked; incremented atomically by `POST /api/agents/:id/fork` |
| `favorite_count` | `INTEGER` | `NOT NULL DEFAULT 0` | Number of users who have favorited this agent |
| `rating_sum` | `INTEGER` | `NOT NULL DEFAULT 0` | Running sum of all star ratings (1–5); used with `rating_count` to compute the average |
| `rating_count` | `INTEGER` | `NOT NULL DEFAULT 0` | Number of ratings submitted |
| `forked_from` | `UUID` | nullable, FK → `agents.id` ON DELETE SET NULL | Source agent UUID when this row was created by a fork; NULL for original agents |
| `tags` | `JSONB` | `NOT NULL DEFAULT '[]'` | Array of lowercase tag strings (max 10, each ≤ 30 chars); GIN indexed for containment queries |
| `category_id` | `UUID` | nullable, FK → `categories.id` ON DELETE SET NULL | Category assignment; NULL means "uncategorized" |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_agents_name` | `name` | Supports filtering/searching agents by name |
| `idx_agents_updated_at` | `updated_at DESC` | Supports default sort order (most recently updated first) |
| `idx_agents_owner_id` | `owner_id` | Supports listing all agents owned by a user |
| `idx_agents_visibility` | `visibility` | Supports filtering public vs. private agents |
| `idx_agents_search_tsv` | `search_tsv` (GIN) | Powers full-text search in `GET /api/agents/marketplace` |
| `idx_agents_public_updated` | `updated_at DESC` WHERE `visibility = 'public'` | Partial index for marketplace listing — avoids scanning private agents |
| `idx_agents_tags` | `tags` (GIN) | Powers `tags @> '["tag"]'` containment queries |
| `idx_agents_category` | `category_id` | Filter by category |

---

### `custom_skills`

Stores reusable skill definitions that can be attached to agents.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Unique skill identifier |
| `label` | `TEXT` | `NOT NULL` | Display name of the skill |
| `color` | `TEXT` | `NOT NULL DEFAULT '#6366f1'` | UI badge color (hex) |
| `description` | `TEXT` | `NOT NULL DEFAULT ''` | Short description of what the skill does |
| `instruction` | `TEXT` | `NOT NULL DEFAULT ''` | Full instruction text injected into the agent |
| `owner_id` | `UUID` | nullable, FK → `users.id` ON DELETE SET NULL | Owning user; NULL for legacy rows created before ownership was introduced |
| `visibility` | `TEXT` | `NOT NULL DEFAULT 'private'` CHECK (`'public'`\|`'private'`) | Access level; existing rows were backfilled to `'public'` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_custom_skills_label` | `label` | Label lookup |
| `idx_custom_skills_owner_id` | `owner_id` | Supports listing all skills owned by a user |
| `idx_custom_skills_visibility` | `visibility` | Supports filtering public vs. private skills |

---

### `users`

Stores user accounts for authentication and identity.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Unique user identifier |
| `email` | `TEXT` | `NOT NULL UNIQUE` | User email address (stored trimmed + lowercase) |
| `password_hash` | `TEXT` | `NOT NULL` | Bcrypt hash of the user's password |
| `display_name` | `TEXT` | `NOT NULL DEFAULT ''` | Optional human-readable name shown in the UI |
| `auth_provider` | `TEXT` | `NOT NULL DEFAULT 'local'` | Auth method: `'local'` (password) or OAuth provider name |
| `tier` | `TEXT` | `NOT NULL DEFAULT 'free'` CHECK (`'free'`\|`'paid'`) | Subscription tier; controls daily quota limits |
| `is_admin` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Admin flag; grants access to `GET /api/audit` and admin-only endpoints |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Registration timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last profile update timestamp |

**Constraints**

- `users_email_normalized` — `CHECK (email = LOWER(TRIM(email)))` enforces that email is always stored in normalized form. The application layer must trim and lowercase before insert.

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_users_email_lower` | `LOWER(email)` UNIQUE | Case-insensitive unique lookup; guards against duplicate accounts differing only in case |
| `idx_users_auth_provider` | `auth_provider` | Supports filtering users by auth method |
| `idx_users_created_at` | `created_at DESC` | Supports admin queries sorted by registration date |

---

### `subscriptions`

Stores user subscriptions to public agents. Uses **reference semantics** — each row is a join record pointing at the original public agent rather than a copy of it. Subscribers always see the live, up-to-date version of the agent.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL`, FK → `users.id` ON DELETE CASCADE, part of PK | Subscribing user |
| `agent_id` | `UUID` | `NOT NULL`, FK → `agents.id` ON DELETE CASCADE, part of PK | Target public agent |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the subscription was created |

**Constraints**

- `PRIMARY KEY (user_id, agent_id)` — composite key prevents a user from subscribing to the same agent more than once. A duplicate `INSERT` raises PostgreSQL error `23505` (unique_violation), which the API translates to HTTP 409.
- `ON DELETE CASCADE` on both foreign keys — deleting a user removes all their subscriptions; deleting an agent removes all subscriptions to it.

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_subscriptions_user_id` | `user_id` | Powers the "My Agents" list: all agents subscribed to by a given user |
| `idx_subscriptions_agent_id` | `agent_id` | Powers analytics / admin queries: all subscribers for a given agent |

**API endpoints**

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/subscriptions` | required | Subscribe to an agent (`{ agentId }` in body). Returns `201` or `409` on duplicate. |
| `DELETE` | `/api/subscriptions/:agentId` | required | Unsubscribe. Returns `204` or `404` if not subscribed. |
| `GET` | `/api/subscriptions` | required | List all agents the authenticated user has subscribed to. Returns agent objects with an extra `subscribedAt` field. |
| `GET` | `/api/subscriptions/:agentId` | required | Check whether the authenticated user is subscribed. Returns `{ subscribed: boolean }`. |

---

---

### `agent_versions`

Immutable snapshots of the canonical agent state. One row is inserted on every save, restore, or fork. Version numbers are monotonically increasing per agent; gaps are not allowed. Equal `canonical_hash` ↔ no content change (no-op detection skips the insert).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Auto-incrementing surrogate key |
| `agent_id` | `UUID` | `NOT NULL`, FK → `agents.id` ON DELETE CASCADE | Owning agent |
| `version_no` | `INT` | `NOT NULL`, UNIQUE with `agent_id` | Monotonically increasing version number per agent |
| `canonical_hash` | `TEXT` | `NOT NULL` | SHA-256 of the serialized canonical JSON; used to detect no-op saves |
| `snapshot` | `JSONB` | `NOT NULL` | Full canonical agent representation at this version |
| `change_summary` | `TEXT` | `NOT NULL DEFAULT ''` | Human-readable description of what changed |
| `created_by` | `UUID` | nullable, FK → `users.id` ON DELETE SET NULL | User who triggered the save; NULL for system-generated versions |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the version was recorded |

---

### `agent_ratings`

One row per `(user_id, agent_id)` pair. Rating aggregates (`rating_sum`, `rating_count`) are maintained on the `agents` table and recomputed in the same transaction as every upsert/delete.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL`, FK → `users.id` ON DELETE CASCADE, part of PK | Rating user |
| `agent_id` | `UUID` | `NOT NULL`, FK → `agents.id` ON DELETE CASCADE, part of PK | Rated agent |
| `rating` | `SMALLINT` | `NOT NULL` CHECK (1–5) | Star rating |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the rating was first submitted |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the rating was last changed |

**Constraints**

- `PRIMARY KEY (user_id, agent_id)` — one rating per user per agent; upsert via `ON CONFLICT DO UPDATE`.
- Self-rating is blocked at the API layer (`PUT /api/agents/:id/rating` returns 400 when caller owns the agent).

---

### `agent_favorites`

Lightweight bookmark table — distinct from subscriptions. Favorite = "save for later"; subscription = "follow the live agent".

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL`, FK → `users.id` ON DELETE CASCADE, part of PK | User who favorited |
| `agent_id` | `UUID` | `NOT NULL`, FK → `agents.id` ON DELETE CASCADE, part of PK | Favorited agent |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the favorite was added |

`favorite_count` on the `agents` table is maintained by atomic increment/decrement in the same transaction as the insert/delete.

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_favorites_user` | `(user_id, created_at DESC)` | "All agents favorited by this user, newest first" |

---

### `agent_events`

Append-only event log. Every tracked user action writes one row. Rows are never updated or deleted (agent deletion cascades).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Auto-incrementing surrogate key |
| `agent_id` | `UUID` | `NOT NULL`, FK → `agents.id` ON DELETE CASCADE | Agent the event is about |
| `actor_id` | `UUID` | nullable, FK → `users.id` ON DELETE SET NULL | User who triggered the action; `NULL` for anonymous actions (e.g. unauthenticated exports) |
| `type` | `TEXT` | `NOT NULL` | Event type: `subscribe` \| `unsubscribe` \| `favorite` \| `unfavorite` \| `fork` \| `rate` \| `export` |
| `meta` | `JSONB` | nullable | Type-specific payload, e.g. `{ "rating": 4 }` or `{ "format": "markdown" }` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the event occurred |

**Event types**

| Type | Emitted by | `meta` |
|---|---|---|
| `subscribe` | `POST /api/agents/:id/subscribe` | — |
| `unsubscribe` | `DELETE /api/agents/:id/subscribe` | — |
| `favorite` | `POST /api/agents/:id/favorite` | — |
| `unfavorite` | `DELETE /api/agents/:id/favorite` | — |
| `fork` | `POST /api/agents/:id/fork` | — |
| `rate` | `PUT /api/agents/:id/rating` | `{ "rating": <1–5> }` |
| `rate` | `DELETE /api/agents/:id/rating` | `null` (indicates removal) |
| `export` | `POST /api/agents/:id/export-event` | `{ "format": "markdown" }` |

**Failure semantics** — event inserts are fire-and-forget (try/catch with console logging). A failed insert never blocks or rolls back the primary action.

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_agent_events_agent` | `(agent_id, created_at DESC)` | Agent activity timeline (owner analytics) |

---

### `categories`

Agent category taxonomy. Used to organize agents in the marketplace.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Unique category identifier |
| `slug` | `TEXT` | `UNIQUE NOT NULL` | URL-safe lowercase identifier (e.g. `developer-tools`) |
| `label` | `TEXT` | `NOT NULL` | Display name (e.g. `Developer Tools`) |
| `color` | `TEXT` | `NOT NULL DEFAULT '#6366f1'` | UI badge color (hex) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |

Six seed categories are inserted on first start: `marketing`, `support`, `research`, `productivity`, `education`, `developer-tools`.

---

### `usage_counters`

Per-user daily quota counters. One row per `(user_id, action, period)` bucket. Incremented atomically via `INSERT … ON CONFLICT DO UPDATE`. Rows for past periods are inert and can be pruned periodically.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | `UUID` | `NOT NULL`, FK → `users.id` ON DELETE CASCADE, part of PK | Quota subject |
| `action` | `TEXT` | `NOT NULL`, part of PK | Metered action name (e.g. `export`, `save`) |
| `period` | `DATE` | `NOT NULL`, part of PK | UTC date bucket |
| `count` | `INTEGER` | `NOT NULL DEFAULT 0` | Running count for this bucket |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_usage_counters_user_today` | `(user_id, action)` WHERE `period = CURRENT_DATE` | Partial index for the common quota-check query |

---

### `audit_log`

Append-only compliance log. Records create, update, delete, and visibility-change actions on key entities. See [audit-log.md](audit-log.md) for full usage documentation.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL` | Monotonic primary key |
| `actor_id` | `UUID` | Nullable — null for system-initiated actions |
| `actor_email_snapshot` | `TEXT` | Denormalized email at write time; survives user deletion |
| `action` | `TEXT` | e.g. `agent.create`, `agent.update`, `agent.delete`, `agent.visibility_change`, `skill.delete` |
| `entity_type` | `TEXT` | e.g. `agent`, `skill` |
| `entity_id` | `UUID` | ID of the affected row |
| `before` | `JSONB` | Snapshot before the change (null for creates) |
| `after` | `JSONB` | Snapshot after the change (null for deletes) |
| `ip` | `TEXT` | Request IP; null for internal/system actions |
| `created_at` | `TIMESTAMPTZ` | Set by DB default; never written by application |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_audit_entity` | `(entity_type, entity_id, created_at DESC)` | Lookup all events for a specific entity |
| `idx_audit_actor` | `(actor_id, created_at DESC)` | Lookup all events by a specific user |

**No UPDATE or DELETE paths exist** for this table anywhere in the application. See [audit-log.md](audit-log.md) for the production `REVOKE` requirement.

---

### `jobs`

Async job queue for webhook deliveries. Jobs are enqueued on agent events and processed by a background worker.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Auto-incrementing job ID |
| `type` | `TEXT` | `NOT NULL` | Job type (e.g. `webhook_delivery`) |
| `payload` | `JSONB` | `NOT NULL` | Job-specific data (e.g. `{ webhookId, event, agentId }`) |
| `status` | `TEXT` | `NOT NULL DEFAULT 'pending'` | `pending` \| `running` \| `done` \| `failed` |
| `attempts` | `INTEGER` | `NOT NULL DEFAULT 0` | Number of delivery attempts made |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the job was enqueued |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last status change timestamp |

---

### `webhooks`

User-registered webhook endpoints. Each webhook can subscribe to one or more agent events and fires an HMAC-signed HTTP POST to a user-provided URL.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Webhook identifier |
| `owner_id` | `UUID` | `NOT NULL`, FK → `users.id` ON DELETE CASCADE | Owning user |
| `url` | `TEXT` | `NOT NULL` | Delivery target URL |
| `secret` | `TEXT` | `NOT NULL` | HMAC-SHA256 signing secret; returned once on creation |
| `events` | `JSONB` | `NOT NULL DEFAULT '[]'` | Array of subscribed event names |
| `active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` | Whether the webhook is enabled |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

### `webhook_deliveries`

Immutable delivery attempt log. One row per attempt; retries create new rows.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Delivery attempt ID |
| `webhook_id` | `UUID` | `NOT NULL`, FK → `webhooks.id` ON DELETE CASCADE | Parent webhook |
| `event` | `TEXT` | `NOT NULL` | Event type that triggered delivery |
| `agent_id` | `UUID` | nullable, FK → `agents.id` ON DELETE SET NULL | Agent the event was about |
| `status_code` | `INTEGER` | nullable | HTTP status code returned by the endpoint |
| `success` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether the delivery succeeded (2xx within 10s) |
| `duration_ms` | `INTEGER` | nullable | Round-trip time in milliseconds |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the delivery was attempted |

---

### `github_connections`

Stores the GitHub OAuth connection for each user. The access token is stored encrypted (AES-256-GCM) and never returned by any API endpoint. See [github-integration.md](github-integration.md).

```sql
CREATE TABLE IF NOT EXISTS github_connections (
  user_id                UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_login           TEXT        NOT NULL,
  access_token_encrypted BYTEA       NOT NULL,
  scopes                 TEXT,
  connected_at           TIMESTAMPTZ DEFAULT NOW()
);
```

---

### `agent_github_sync`

Per-agent GitHub sync configuration. When configured, agent definitions can be pushed to or pulled from a GitHub repository branch.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `agent_id` | `UUID` | PK, FK → `agents.id` ON DELETE CASCADE | Agent being synced |
| `owner` | `TEXT` | `NOT NULL` | GitHub repository owner (user or org) |
| `repo` | `TEXT` | `NOT NULL` | Repository name |
| `branch` | `TEXT` | `NOT NULL DEFAULT 'main'` | Target branch |
| `path` | `TEXT` | `NOT NULL DEFAULT 'agent.json'` | File path within the repo |
| `auto_push` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether to auto-push on every agent save |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Configuration creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

## MongoDB Collections

MongoDB (database name: `agentbuilder`) stores document-shaped operational data. Collections and indexes are initialized by `backend/src/mongo-init.js` on every backend startup (idempotent).

| Collection | Purpose | Key indexes |
|---|---|---|
| `builtin_skills` | 35 pre-built skill definitions displayed in the Skills panel | `{ id: 1 }` unique |
| `persona_categories` | 11 persona category documents (each with an array of personas) | `{ id: 1 }` unique |
| `user_preferences` | Per-user UI preferences (theme, canvas zoom/pan, sidebar width) | `{ userId: 1 }` unique |
| `workspace_state` | Per-workspace canvas state (selected agent, node positions, active tab) | `{ workspaceId: 1 }` unique |
| `draft_agents` | Auto-save drafts per workspace | `{ workspaceId: 1, createdAt: -1 }` compound; TTL index 30 days |
| `agent_templates` | 5 starter agent templates shown in the new-agent flow | `{ id: 1 }` unique |

### Built-in skill counts

The `builtin_skills` collection currently holds **35 skills** organized into four categories:

| Category | Skills |
|---|---|
| Personality & Voice | caveman, formal_mode, eli5, pirate, stoic, news_anchor, enthusiast, professor |
| Behavior & Reasoning | grill_me, devils_advocate, socratic, show_reasoning, steel_man, assumptions_audit, red_team, contrarian, ten_x_check |
| Output Format | bullets_only, tldr_first, cite_sources, concise, step_by_step, table_format, action_items, no_jargon, explain_then_conclude |
| Utility | token_usage, proofread, always_ask, confidence_score, risk_flag, next_steps, plain_english_summary, time_estimate, expert_panel |

---

## Design Notes

- **UUID primary keys** — all tables use `gen_random_uuid()` so IDs are globally unique and safe to expose in APIs.
- **JSONB for flexible fields** — `tools`, `positions`, `skills`, and `instructions` are stored as JSONB to allow schema-free evolution without migrations for structural changes to these arrays/objects.
- **TIMESTAMPTZ** — all timestamps are stored with timezone information to avoid ambiguity.
- The `updated_at` column is updated explicitly to `NOW()` in every `UPDATE` statement (no trigger needed for the current load).
- **Fork provenance** — `agents.forked_from` records the source agent UUID at fork time. It uses `ON DELETE SET NULL` so deleting the source does not cascade to forks. `fork_count` on the source is incremented atomically in the same transaction as the fork `INSERT`, ensuring the count is never out of sync.
- **Subscription vs fork semantics** — subscriptions use reference semantics (subscriber always sees the live source); forks use snapshot semantics (the copy is fully independent from the moment of creation).

## Local Development

Start PostgreSQL via Docker Compose:

```bash
docker compose --env-file .env.local up -d
```

The init scripts run automatically on first start and create all tables. To connect manually:

```bash
docker compose exec postgres psql -U agentforge -d agentforge
```

See `backend/.env.example` for the full list of connection environment variables.
