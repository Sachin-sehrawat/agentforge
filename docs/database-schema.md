









# Database Schema

AgentForge uses **PostgreSQL 14+** as its primary data store. The schema is initialized automatically when starting the Docker Compose stack via the ordered init scripts in `backend/db/init/` (`01_schema.sql`, `02_performance_indexes.sql`, `03_users.sql`, `04_ownership.sql`).

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
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_agents_name` | `name` | Supports filtering/searching agents by name |
| `idx_agents_updated_at` | `updated_at DESC` | Supports default sort order (most recently updated first) |
| `idx_agents_owner_id` | `owner_id` | Supports listing all agents owned by a user |
| `idx_agents_visibility` | `visibility` | Supports filtering public vs. private agents |

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

## Design Notes

- **UUID primary keys** — all tables use `gen_random_uuid()` so IDs are globally unique and safe to expose in APIs.
- **JSONB for flexible fields** — `tools`, `positions`, `skills`, and `instructions` are stored as JSONB to allow schema-free evolution without migrations for structural changes to these arrays/objects.
- **TIMESTAMPTZ** — all timestamps are stored with timezone information to avoid ambiguity.
- The `updated_at` column is updated explicitly to `NOW()` in every `UPDATE` statement (no trigger needed for the current load).

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
