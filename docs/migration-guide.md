# SQLite → PostgreSQL Migration Guide

This guide covers migrating existing AgentForge data from the legacy SQLite
`agents.db` file to the production PostgreSQL database.

## Overview

| | SQLite (legacy) | PostgreSQL (current) |
|---|---|---|
| `agents.id` | `TEXT` (UUID string) | `UUID` |
| `agents.tools` | `TEXT` (JSON string) | `JSONB` |
| `agents.positions` | `TEXT` (JSON string) | `JSONB` |
| `agents.skills` | `TEXT` (JSON string) | `JSONB` |
| `agents.instructions` | `TEXT` (JSON string) | `JSONB` |
| Timestamps | `TEXT` (`datetime('now')` UTC) | `TIMESTAMPTZ` |
| `custom_skills.id` | `TEXT` (UUID string) | `UUID` |

The migration script handles all field conversions automatically.

---

## Prerequisites

1. **PostgreSQL running** — start the Docker stack if you haven't already:

   ```bash
   docker compose --env-file .env.local up -d
   ```

2. **Install the SQLite dependency** — the script uses `better-sqlite3` to read
   the source database. Install it once before running the script:

   ```bash
   cd backend
   npm install
   ```

3. **Environment variables** — copy `.env.example` to `.env` and fill in your
   PostgreSQL credentials (or set `DATABASE_URL`):

   ```bash
   cp backend/.env.example backend/.env
   # edit backend/.env
   ```

---

## Usage

Run the script from the `backend/` directory:

```bash
cd backend
node scripts/migrate-sqlite-to-pg.js [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--sqlite-path <path>` | `agents.db` | Path to the SQLite file (relative to `backend/`) |
| `--backup-dir <path>` | `backups/` | Directory where the PostgreSQL backup is saved |
| `--dry-run` | — | Validate and print transformed records without writing |
| `--help`, `-h` | — | Show usage information |

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error or validation failure |

---

## Step-by-Step

### 1. Dry run first

Always preview the migration before writing:

```bash
cd backend
node scripts/migrate-sqlite-to-pg.js --dry-run
```

This prints every transformed record to stdout without touching PostgreSQL.
Review the output and confirm the data looks correct.

### 2. Run the migration

```bash
node scripts/migrate-sqlite-to-pg.js
```

The script will:

1. Verify the SQLite file exists and is readable.
2. Read all rows from `agents` and `custom_skills`.
3. Transform each row (parse JSON strings → objects, convert timestamps).
4. **Back up** the current PostgreSQL data to `backend/backups/pg-backup-<timestamp>.json`.
5. Insert all rows inside a single transaction (`ON CONFLICT DO NOTHING` to skip
   any IDs that already exist in PostgreSQL).
6. Validate that the post-migration row counts match expectations.
7. Print a summary.

### 3. Verify the result

Connect to PostgreSQL and spot-check the data:

```bash
docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT id, name, model, created_at FROM agents ORDER BY created_at;"

docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT id, label, color FROM custom_skills;"
```

---

## Rollback

If you need to undo the migration, restore from the backup created in step 2:

```bash
# Find the backup file
ls backend/backups/

# Restore agents (example using the backup JSON via psql + a helper script)
node - << 'EOF'
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const backup = JSON.parse(fs.readFileSync('backend/backups/pg-backup-<timestamp>.json'));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

await client.query('BEGIN');
await client.query('DELETE FROM agents');
await client.query('DELETE FROM custom_skills');

for (const a of backup.agents) {
  await client.query(
    `INSERT INTO agents VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.id, a.name, a.persona, a.system_prompt, a.model,
     JSON.stringify(a.tools), JSON.stringify(a.positions),
     JSON.stringify(a.skills), JSON.stringify(a.instructions),
     a.created_at, a.updated_at]
  );
}
for (const s of backup.custom_skills) {
  await client.query(
    `INSERT INTO custom_skills VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [s.id, s.label, s.color, s.description, s.instruction, s.created_at, s.updated_at]
  );
}

await client.query('COMMIT');
client.release();
await pool.end();
console.log('Rollback complete');
EOF
```

> **Note:** Replace `<timestamp>` with the actual filename from `backend/backups/`.

---

## Troubleshooting

### `sql.js is not installed`

```
[ERROR] sql.js is not installed.
[ERROR] Run: npm install --save-dev sql.js
```

Run `npm install` inside `backend/`. The package is listed in `devDependencies`.

### `SQLite file not found`

```
[ERROR] SQLite file not found: .../agents.db
```

Pass the correct path with `--sqlite-path`:

```bash
node scripts/migrate-sqlite-to-pg.js --sqlite-path /path/to/agents.db
```

### `connect ECONNREFUSED`

PostgreSQL is not reachable. Start it with `docker compose --env-file .env.local up -d` and verify
your `.env` credentials.

### Duplicate ID conflicts

If some IDs already exist in PostgreSQL, those rows are skipped (`ON CONFLICT DO
NOTHING`) and counted as **skipped** in the summary. This is safe — it means the
data was already migrated.

### Non-UUID source IDs

If a row's `id` column is not a valid UUID, the script generates a new UUID and
logs a warning. The original value is printed so you can track the mapping.

---

## SQLite Schema Reference

The source `agents.db` tables are:

```sql
CREATE TABLE agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    persona       TEXT DEFAULT '',
    system_prompt TEXT DEFAULT '',
    model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    tools         TEXT NOT NULL DEFAULT '[]',
    positions     TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    skills        TEXT NOT NULL DEFAULT '[]',
    instructions  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE custom_skills (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT NOT NULL DEFAULT '',
    instruction TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

See [database-schema.md](database-schema.md) for the PostgreSQL target schema.
