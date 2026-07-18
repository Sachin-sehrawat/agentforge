# Migration Checklist

Use this checklist every time you run the SQLite → PostgreSQL migration.
Complete every item in order. Do **not** skip steps.

---

## Pre-Migration Checklist

### Environment

- [ ] Docker Compose stack is running: `docker compose up -d`
- [ ] PostgreSQL is healthy: `docker compose ps` shows `postgres` as `healthy`
- [ ] MongoDB is healthy: `docker compose ps` shows `mongodb` as `healthy`
- [ ] `backend/.env` exists and contains correct `POSTGRES_*` / `MONGO_URI` values
- [ ] `backend/node_modules` is up to date: `cd backend && npm install`

### Source data

- [ ] SQLite file exists: `backend/agents.db` (or custom path)
- [ ] SQLite is not currently locked by the running backend (stop the server first)
- [ ] Row counts noted from SQLite for post-migration comparison:

  ```bash
  # Quick count without sql.js:
  sqlite3 backend/agents.db "SELECT COUNT(*) FROM agents; SELECT COUNT(*) FROM custom_skills;"
  ```

  | Table | Count |
  |---|---|
  | `agents` | ______ |
  | `custom_skills` | ______ |

### Backups — MANDATORY before migrating

- [ ] SQLite backup created:
  ```bash
  cd backend && node scripts/backup-sqlite.js
  ```
  Backup file: `backups/sqlite/sqlite-backup-<timestamp>.db`

- [ ] PostgreSQL backup created (captures any existing PG data):
  ```bash
  node scripts/backup-postgresql.js
  ```
  Backup file: `backups/postgresql/pg-backup-<timestamp>.json`

- [ ] MongoDB backup created:
  ```bash
  node scripts/backup-mongodb.js
  ```
  Backup file: `backups/mongodb/mongo-backup-<timestamp>.json`

- [ ] All three backup files confirmed present in their directories
- [ ] Backup files are **not** zero bytes

### Dry run

- [ ] Dry run completed successfully:
  ```bash
  node scripts/migrate-sqlite-to-pg.js --dry-run
  ```
- [ ] Dry-run output reviewed — no unexpected warnings about missing fields or
  non-UUID IDs (or warnings understood and accepted)
- [ ] No data loss expected based on dry-run output

---

## Migration Execution Checklist

- [ ] Team notified that migration is starting (if production environment)
- [ ] Backend service stopped or put in maintenance mode
- [ ] Migration script run:
  ```bash
  cd backend
  node scripts/migrate-sqlite-to-pg.js
  ```
- [ ] Script exited with code `0` (success)
- [ ] No `[ERROR]` lines in the output
- [ ] Migration summary printed and reviewed

---

## Post-Migration Verification Checklist

### Row count validation

- [ ] PostgreSQL row counts match SQLite source counts:

  ```bash
  docker compose exec postgres psql -U agentforge -d agentforge \
    -c "SELECT COUNT(*) FROM agents; SELECT COUNT(*) FROM custom_skills;"
  ```

  | Table | Expected (from SQLite) | Actual (PostgreSQL) | Match? |
  |---|---|---|---|
  | `agents` | ______ | ______ | [ ] |
  | `custom_skills` | ______ | ______ | [ ] |

### Data spot-check

- [ ] Sample agent retrieved and data looks correct:
  ```bash
  docker compose exec postgres psql -U agentforge -d agentforge \
    -c "SELECT id, name, model, created_at FROM agents ORDER BY created_at LIMIT 5;"
  ```

- [ ] Sample skill retrieved:
  ```bash
  docker compose exec postgres psql -U agentforge -d agentforge \
    -c "SELECT id, label, color FROM custom_skills LIMIT 5;"
  ```

- [ ] JSONB fields are valid (not empty strings):
  ```bash
  docker compose exec postgres psql -U agentforge -d agentforge \
    -c "SELECT id, jsonb_array_length(tools) AS tool_count FROM agents LIMIT 5;"
  ```

### Application smoke test

- [ ] Backend restarted against PostgreSQL
- [ ] GET `/api/health` returns `200`
- [ ] GET `/api/agents` returns expected list
- [ ] An agent can be created via the UI
- [ ] An agent can be loaded and saved via the UI
- [ ] Markdown export works

### MongoDB check

- [ ] MongoDB collections still present after migration:
  ```bash
  docker compose exec mongodb mongosh \
    -u admin -p adminpassword --authenticationDatabase admin \
    agentbuilder --eval "db.getCollectionNames()"
  ```

---

## Rollback Decision Criteria

Initiate rollback if ANY of the following are true:

| Condition | Action |
|---|---|
| Row count mismatch > 0 after migration | Rollback immediately |
| `[ERROR]` lines in migration output | Rollback immediately |
| JSONB fields contain invalid / null data | Rollback immediately |
| Backend fails to start against PostgreSQL | Investigate → rollback if unresolved in 30 min |
| API returns 5xx on core endpoints | Investigate → rollback if unresolved in 15 min |

### Rollback procedure (quick reference)

```bash
cd backend

# 1. Dry-run to confirm backup is valid
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --dry-run

# 2. Execute rollback (restores SQLite from the PG JSON backup)
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --sqlite-path agents.db

# 3. Restore MongoDB if needed
node scripts/rollback-migration.js \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>.json \
  --mongo-only

# 4. Revert backend configuration to SQLite mode and restart
```

See [disaster-recovery.md](disaster-recovery.md) for the full rollback runbook.

---

## Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| Engineer running migration | | | |
| Reviewer / second pair of eyes | | | |

---

## Related Documents

- [Migration Guide](migration-guide.md) — Full migration instructions
- [Disaster Recovery Plan](disaster-recovery.md) — Backup & rollback runbook
- [Database Schema](database-schema.md) — Schema reference
