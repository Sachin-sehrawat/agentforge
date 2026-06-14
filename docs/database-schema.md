









# Database Schema

AgentForge uses **PostgreSQL 14+** as its primary data store. The schema is initialized automatically when starting the Docker Compose stack via the init script at `backend/db/init/01_schema.sql`.

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
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |

**Indexes**

| Name | Column | Rationale |
|---|---|---|
| `idx_agents_name` | `name` | Supports filtering/searching agents by name |
| `idx_agents_updated_at` | `updated_at DESC` | Supports default sort order (most recently updated first) |

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
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |

---

## Design Notes

- **UUID primary keys** — both tables use `gen_random_uuid()` so IDs are globally unique and safe to expose in APIs.
- **JSONB for flexible fields** — `tools`, `positions`, `skills`, and `instructions` are stored as JSONB to allow schema-free evolution without migrations for structural changes to these arrays/objects.
- **TIMESTAMPTZ** — all timestamps are stored with timezone information to avoid ambiguity.
- The `updated_at` column is updated explicitly to `NOW()` in every `UPDATE` statement (no trigger needed for the current load).

## Local Development

Start PostgreSQL via Docker Compose:

```bash
docker-compose up -d
```

The init script runs automatically on first start and creates both tables. To connect manually:

```bash
docker-compose exec postgres psql -U agentforge -d agentforge
```

See `backend/.env.example` for the full list of connection environment variables.
