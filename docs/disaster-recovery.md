# Disaster Recovery Plan

AgentForge Backup & Disaster Recovery runbook for PostgreSQL (agent data),
MongoDB (preferences and workspace state), and SQLite (legacy / rollback target).

---

## Storage Locations

| Backup type | Default path | Recommended cloud copy |
|---|---|---|
| SQLite binary + metadata | `backend/backups/sqlite/` | S3 / GCS bucket `agentforge-backups/sqlite/` |
| PostgreSQL JSON export | `backend/backups/postgresql/` | S3 / GCS bucket `agentforge-backups/postgresql/` |
| MongoDB JSON export | `backend/backups/mongodb/` | S3 / GCS bucket `agentforge-backups/mongodb/` |

> Local backups are suitable for development. For production, configure the cloud
> sync jobs described in the [Cron Jobs](#automated-daily-backups-cron-jobs) section.

---

## Retention Policy

- **Keep** the last **30 days** of daily backups.
- **Delete** files older than 30 days automatically (see cron job below).
- **Always preserve** the backup taken immediately before a migration run —
  tag these files with the prefix `pre-migration-` so they are never swept.

---

## Automated Daily Backups (Cron Jobs)

Run these from the `backend/` directory. Add them to the system crontab
(`crontab -e`) or your CI/CD scheduler:

```cron
# SQLite — 02:00 UTC daily
0 2 * * * cd /path/to/agent-builder/backend && node scripts/backup-sqlite.js >> /var/log/agentforge-backup.log 2>&1

# PostgreSQL — 02:05 UTC daily
5 2 * * * cd /path/to/agent-builder/backend && node scripts/backup-postgresql.js >> /var/log/agentforge-backup.log 2>&1

# MongoDB — 02:10 UTC daily
10 2 * * * cd /path/to/agent-builder/backend && node scripts/backup-mongodb.js >> /var/log/agentforge-backup.log 2>&1

# Prune backups older than 30 days — 03:00 UTC daily
0 3 * * * find /path/to/agent-builder/backend/backups -type f -mtime +30 -delete
```

**Windows Task Scheduler equivalent** (PowerShell):

```powershell
$action  = New-ScheduledTaskAction -Execute 'node' `
             -Argument 'scripts/backup-postgresql.js' `
             -WorkingDirectory 'C:\path\to\agent-builder\backend'
$trigger = New-ScheduledTaskTrigger -Daily -At 2:05AM
Register-ScheduledTask -TaskName 'AgentForge-PG-Backup' `
  -Action $action -Trigger $trigger -RunLevel Highest
```

### Cloud sync (optional, recommended for production)

After each backup script completes, sync the directory to cloud storage:

```bash
# AWS S3
aws s3 sync backend/backups/ s3://agentforge-backups/ --delete

# Google Cloud Storage
gsutil rsync -r backend/backups/ gs://agentforge-backups/
```

Add the sync command as a fourth step in each cron entry or as a post-backup
hook script.

---

## Monitoring & Alerts

Set up alerting on the backup cron jobs so the team is notified of failures.
A minimal approach using a health-check URL (e.g., Healthchecks.io or Cronitor):

```bash
# Wrap each backup command:
node scripts/backup-postgresql.js && curl -s https://hc-ping.com/<YOUR_UUID>
```

Alert conditions to configure:

| Condition | Severity | Action |
|---|---|---|
| Cron job silent for >25 hours | High | Page on-call |
| Backup file size drops >50% vs prior day | Medium | Investigate |
| Backup directory disk usage >80% | Medium | Prune or expand storage |

---

## Scenarios & Recovery Procedures

### Scenario 1 — Corrupt or lost PostgreSQL data

**Symptoms:** Agents missing from the UI, DB query errors, table truncated.

**Recovery steps:**

```bash
# 1. List available backups
ls -lt backend/backups/postgresql/

# 2. Dry-run to verify backup integrity
node scripts/rollback-migration.js \
  --pg-backup backend/backups/postgresql/pg-backup-<stamp>.json \
  --dry-run

# 3. Restore
node scripts/rollback-migration.js \
  --pg-backup backend/backups/postgresql/pg-backup-<stamp>.json

# 4. Verify row counts in PostgreSQL
docker compose exec postgres psql -U agentforge -d agentforge \
  -c "SELECT COUNT(*) FROM agents; SELECT COUNT(*) FROM custom_skills;"
```

**RTO target:** < 30 minutes  
**RPO target:** < 24 hours (last nightly backup)

---

### Scenario 2 — Corrupt or lost MongoDB data

**Symptoms:** User preferences reset, workspace state lost, draft agents gone.

**Recovery steps:**

```bash
# 1. List available backups
ls -lt backend/backups/mongodb/

# 2. Dry-run
node scripts/rollback-migration.js \
  --mongo-backup backend/backups/mongodb/mongo-backup-<stamp>.json \
  --mongo-only --dry-run

# 3. Restore
node scripts/rollback-migration.js \
  --mongo-backup backend/backups/mongodb/mongo-backup-<stamp>.json \
  --mongo-only
```

---

### Scenario 3 — Failed PostgreSQL migration (rollback to SQLite)

Use this if the migration from SQLite to PostgreSQL introduced data corruption
or an outage and you need to revert the application to the SQLite code path.

**Pre-requisites:** A `pre-migration-*` SQLite backup must exist in
`backend/backups/sqlite/`. The migration script creates a PostgreSQL backup
automatically before writing; use that as the `--pg-backup` source to ensure
the most up-to-date data is restored.

**Recovery steps:**

```bash
# 1. Find the pre-migration PostgreSQL backup (created by migrate-sqlite-to-pg.js)
ls -lt backend/backups/postgresql/ | head -5

# 2. Dry-run rollback
node scripts/rollback-migration.js \
  --pg-backup backend/backups/postgresql/pg-backup-<stamp>.json \
  --sqlite-path backend/agents.db \
  --dry-run

# 3. Execute rollback
node scripts/rollback-migration.js \
  --pg-backup backend/backups/postgresql/pg-backup-<stamp>.json \
  --sqlite-path backend/agents.db

# 4. Switch backend to SQLite mode (revert DATABASE_URL / POSTGRES_* env vars)
#    and restart the service.

# 5. Verify SQLite has expected data
node scripts/backup-sqlite.js --sqlite-path backend/agents.db
```

---

### Scenario 4 — Full system loss (new machine setup)

```bash
# 1. Clone the repository and restore .env from your secret manager

# 2. Start databases
docker compose --env-file .env.local up -d postgres mongodb

# 3. Restore PostgreSQL
node scripts/rollback-migration.js \
  --pg-backup /path/to/cloud/pg-backup-<stamp>.json

# 4. Restore MongoDB
node scripts/rollback-migration.js \
  --mongo-backup /path/to/cloud/mongo-backup-<stamp>.json \
  --mongo-only

# 5. Start the backend
docker compose up -d backend
```

---

## Dry-Run Rollback Procedure (Validated)

The `--dry-run` flag on `rollback-migration.js` performs the following without
writing anything to disk or databases:

1. Parses and validates the backup JSON files.
2. Verifies all required fields are present for each agent and skill.
3. Prints row/document counts that would be restored.
4. Returns exit code `0` on success, `1` on validation failure.

**Recommended practice:** Always run with `--dry-run` first, inspect the output,
then re-run without the flag to commit the restore.

```bash
# Step 1: validate
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>.json \
  --dry-run

# Step 2: commit (only after Step 1 exits 0)
node scripts/rollback-migration.js \
  --pg-backup backups/postgresql/pg-backup-<stamp>.json \
  --mongo-backup backups/mongodb/mongo-backup-<stamp>.json
```

---

## Backup/Restore Procedures — Team Reference

| Who | Responsibility |
|---|---|
| Any developer | Run manual backups before schema changes or migrations |
| On-call engineer | Execute recovery procedure within 30 min of incident |
| Lead / DevOps | Verify cron jobs weekly; audit cloud sync monthly |

**Quick-reference commands:**

```bash
# Manual backup (all three stores)
cd backend
node scripts/backup-sqlite.js
node scripts/backup-postgresql.js
node scripts/backup-mongodb.js

# Validate a backup without restoring
node scripts/rollback-migration.js --pg-backup <file> --dry-run

# Full rollback
node scripts/rollback-migration.js \
  --pg-backup <pg-file> --mongo-backup <mongo-file>
```

---

## Related Documents

- [Migration Guide](migration-guide.md) — SQLite → PostgreSQL migration steps
- [Database Schema](database-schema.md) — Table and collection definitions
- [Migration Checklist](migration-checklist.md) — Pre/post-migration verification
- [Docker Setup](docker-setup.md) — Starting the local database stack
