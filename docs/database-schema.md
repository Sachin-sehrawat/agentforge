









# Database Schema

AgentForge uses **PostgreSQL 14+** as its primary data store. The schema is initialized automatically when starting the Docker Compose stack via the ordered init scripts in `backend/db/init/`:

| File | Contents |
|---|---|
| `01_schema.sql` | Core tables: `agents`, `custom_skills`, `users`, `subscriptions`, `agent_versions` |
| `02_performance_indexes.sql` | Additional composite indexes |
| `03_users.sql` | User-related constraints and indexes |
| `04_ownership.sql` | Ownership backfill |
| `05_subscriptions.sql` | Subscription constraints |
| `06_agent_versions.sql` | Version history table |
| `07_marketplace.sql` | Marketplace columns: `search_tsv`, `fork_count`, `favorite_count`, `rating_sum`, `rating_count`, `forked_from`; full-text search trigger |
| `08_ratings.sql` | `agent_ratings` table |

## Tables

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
docker-compose up -d
```

The init scripts run automatically on first start and create all tables. To connect manually:

```bash
docker-compose exec postgres psql -U agentforge -d agentforge
```

See `backend/.env.example` for the full list of connection environment variables.
